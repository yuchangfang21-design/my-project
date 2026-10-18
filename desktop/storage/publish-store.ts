import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { CreateTasksInput, DesktopTask } from '../../shared/desktop-contracts.js';
import type { PublishDraftInput, PublishTaskDetails, PublicationReceipt } from '../../shared/publishing-contracts.js';
import { id, record, text } from '../validation.js';

export type AttemptRecord = { id:string; taskId:string; batchId:string; revision:number; targetRemoteId:string; contextId:string; phase:'reserved'|'preparing'|'submit_intent'|'finished'; outcome:'none'|'not_submitted'|'submitted'|'review'; receipt?:PublicationReceipt; createdAt:string };
export class PublishStore {
  constructor(private db:Database.Database) {}
  listTasks(): DesktopTask[] { return (this.db.prepare('SELECT data,status FROM tasks ORDER BY rowid DESC').all() as any[]).map(row => ({...JSON.parse(row.data),status:row.status})); }
  task(taskId:string): DesktopTask {
    const row=this.db.prepare('SELECT data,status FROM tasks WHERE id=?').get(id(taskId)) as any;
    if(!row)throw new Error('任务不存在');return {...JSON.parse(row.data),status:row.status};
  }
  private writeTask(task:DesktopTask):void { this.db.prepare('UPDATE tasks SET data=?,status=? WHERE id=?').run(JSON.stringify(task),task.status,task.id); }
  private event(taskId:string,kind:string,summary:string,attemptId:string|null=null):void {
    this.db.prepare('INSERT INTO task_events(task_id,event,created_at,attempt_id,kind) VALUES(?,?,?,?,?)').run(taskId,summary,new Date().toISOString(),attemptId,kind);
  }
  getDetails(taskId:string):PublishTaskDetails {
    const task=this.task(taskId);
    const events=(this.db.prepare('SELECT * FROM task_events WHERE task_id=? ORDER BY id').all(task.id) as any[]).map(row=>({id:row.id,taskId:row.task_id,attemptId:row.attempt_id,kind:row.kind,summary:row.event,createdAt:row.created_at}));
    const attempt=this.db.prepare('SELECT id FROM publish_attempts WHERE task_id=? ORDER BY rowid DESC LIMIT 1').get(task.id) as any;
    const manual=attempt && this.db.prepare('SELECT result,note,created_at FROM publish_manual_checks WHERE task_id=? AND attempt_id=? ORDER BY id DESC LIMIT 1').get(task.id,attempt.id) as any;
    return {task,events,latestAttemptId:attempt?.id||null,manualCheck:manual?{result:manual.result,note:manual.note,createdAt:manual.created_at}:null};
  }
  createTasks(input:CreateTasksInput):DesktopTask[] {
    const data=record(input,['assetId','accountIds','title']);const assetId=id(data.assetId),title=text(data.title,'作品标题',100);
    if(!Array.isArray(data.accountIds)||!data.accountIds.length||data.accountIds.length>100)throw new Error('请选择 1—100 个账号');
    const accounts=Array.from(new Set(data.accountIds.map(id)));
    return this.db.transaction(()=>{
      const row=this.db.prepare('SELECT data,sha256 FROM assets WHERE id=?').get(assetId) as any;
      if(!row)throw new Error('素材不存在');if(JSON.parse(row.data).availability && JSON.parse(row.data).availability!=='ready')throw new Error('素材文件不可用，请重新导入原视频后重试');
      for(const accountId of accounts)if(!this.db.prepare('SELECT id FROM accounts WHERE id=?').get(accountId))throw new Error('账号不存在');
      const tasks:DesktopTask[]=[];
      for(const accountId of accounts){
        if(this.db.prepare("SELECT id FROM tasks WHERE account_id=? AND asset_id=? AND status IN ('pending','waiting_login','running')").get(accountId,assetId))continue;
        if(this.db.prepare("SELECT id FROM tasks WHERE account_id=? AND asset_id=? AND status IN ('submitted','published','review','rejected')").get(accountId,assetId))throw new Error('已有提交或待核对历史，请查看原任务，不能重复创建');
        const task:DesktopTask={id:randomUUID(),accountId,assetId,title,status:'pending',time:'手动执行',revision:1,description:'',tags:[],assetSha256:row.sha256};
        this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?)').run(task.id,accountId,assetId,task.status,JSON.stringify(task));this.event(task.id,'created','创建本地任务');tasks.push(task);
      }
      if(!tasks.length)throw new Error('已有未完成任务，请勿重复创建');return tasks;
    })();
  }
  updateDraft(input:PublishDraftInput):DesktopTask {
    const data=record(input,['taskId','expectedRevision','title','description','tags']);id(data.taskId);
    if(!Number.isInteger(data.expectedRevision)||Number(data.expectedRevision)<1)throw new Error('任务修订无效');
    const title=text(data.title,'作品标题',100),description=text(data.description,'作品说明',2000,true);
    if(!Array.isArray(data.tags)||data.tags.length>10)throw new Error('标签最多 10 项');
    const tags=Array.from(new Set(data.tags.map(tag=>text(tag,'标签',30))));
    return this.db.transaction(()=>{
      const task=this.task(String(data.taskId));
      if(task.revision!==data.expectedRevision)throw new Error('任务已变化，请重新加载后编辑');
      if(!['pending','failed'].includes(task.status)||this.db.prepare("SELECT id FROM publish_attempts WHERE task_id=? AND phase!='finished'").get(task.id))throw new Error('当前任务不能编辑');
      const next={...task,title,description,tags,revision:task.revision+1};this.writeTask(next);this.event(task.id,'edited','修改本地发布信息');return next;
    })();
  }
  cancelTask(taskId:string):void {
    this.db.transaction(()=>{
      const task=this.task(taskId);if(task.status==='cancelled')return;
      if(!['pending','waiting_login','failed'].includes(task.status))throw new Error('任务已经开始，不能取消提交，请核对结果');
      this.writeTask({...task,status:'cancelled'});this.event(task.id,'cancelled','用户取消');
    })();
  }
}
