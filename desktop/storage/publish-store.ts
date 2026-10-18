import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { CreateTasksInput, DesktopTask } from '../../shared/desktop-contracts.js';
import type { PublishDraftInput, PublishTaskDetails, PublicationReceipt, PublishReviewRow, PublishBatch, ManualCheckInput, RepostDraftInput } from '../../shared/publishing-contracts.js';
import { id, record, text } from '../validation.js';

export type AttemptRecord = { id:string; taskId:string; batchId:string; revision:number; targetRemoteId:string; contextId:string; adapterVersion:string; snapshot:PublishReviewRow; phase:'reserved'|'preparing'|'submit_intent'|'finished'; outcome:'none'|'not_submitted'|'submitted'|'review'; receipt?:PublicationReceipt; createdAt:string };
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
      const attempt=this.getAttempt(taskId);
      if(attempt && attempt.phase!=='finished'){
        if(attempt.phase!=='reserved')throw new Error('任务已经开始，不能取消提交，请核对结果');
        this.writeAttempt({...attempt,phase:'finished',outcome:'not_submitted'});
      }
      this.writeTask({...task,status:'cancelled'});this.event(task.id,'cancelled','用户取消');
    })();
  }
  getAttempt(taskId:string):AttemptRecord|null {
    const row=this.db.prepare('SELECT data,phase,outcome FROM publish_attempts WHERE task_id=? ORDER BY rowid DESC LIMIT 1').get(id(taskId)) as any;
    return row?{...JSON.parse(row.data),phase:row.phase,outcome:row.outcome}:null;
  }
  private attempt(attemptId:string):AttemptRecord {
    const row=this.db.prepare('SELECT data,phase,outcome FROM publish_attempts WHERE id=?').get(id(attemptId)) as any;
    if(!row)throw new Error('执行尝试不存在');
    return {...JSON.parse(row.data),phase:row.phase,outcome:row.outcome};
  }
  private writeAttempt(attempt:AttemptRecord):void {
    this.db.prepare('UPDATE publish_attempts SET data=?,phase=?,outcome=? WHERE id=?').run(JSON.stringify(attempt),attempt.phase,attempt.outcome,attempt.id);
  }
  hasConflictingSubmissionHistory(taskId:string):boolean {
    const task=this.task(taskId);
    const siblings=this.db.prepare("SELECT id,status FROM tasks WHERE account_id=? AND asset_id=? AND id!=? AND status IN ('submitted','published','review','rejected')").all(task.accountId,task.assetId,task.id) as {id:string;status:string}[];
    if(!siblings.length)return false;
    const intent=task.repostOf?this.db.prepare("SELECT id FROM task_events WHERE task_id=? AND kind='repost_created' ORDER BY id LIMIT 1").get(task.id) as {id:number}|undefined:undefined;
    return siblings.some(sibling=>{
      if(!intent||['submitted','review'].includes(sibling.status))return true;
      // Only a deliberate repost created after the known submission covers that history.
      // Event IDs preserve transaction order without depending on the device clock.
      const marker=this.db.prepare("SELECT MAX(id) AS id FROM task_events WHERE task_id=? AND kind='submit_intent'").get(sibling.id) as {id:number|null};
      return marker.id===null||marker.id>=intent.id;
    });
  }
  reserveBatch(reviewId:string,rows:PublishReviewRow[]):PublishBatch {
    id(reviewId);
    if(!Array.isArray(rows)||!rows.length||rows.length>100||new Set(rows.map(r=>r.taskId)).size!==rows.length)throw new Error('发布清单无效');
    return this.db.transaction(()=>{
      const existing=this.db.prepare('SELECT data FROM publish_batches WHERE review_id=?').get(reviewId) as any;
      if(existing){const batch:PublishBatch=JSON.parse(existing.data);if(JSON.stringify(batch.taskIds)!==JSON.stringify(rows.map(r=>r.taskId)))throw new Error('确认清单不一致');return batch;}
      for(const row of rows){
        const task=this.task(row.taskId),details=this.getDetails(task.id),prior=this.getAttempt(task.id);
        if(this.hasConflictingSubmissionHistory(task.id))throw new Error('同一账号和素材已有提交或待核对历史，请查看最新任务并明确创建新的发布意图');
        const reviewedAbsence=task.status==='review' && prior?.phase==='finished' && prior.outcome==='review' && details.manualCheck?.result==='not_found';
        if(!['pending','failed','waiting_login'].includes(task.status)&&!reviewedAbsence)throw new Error('当前任务不能发布，请先核对结果');
        if(prior && prior.phase!=='finished')throw new Error('任务已有活动的执行尝试');
        if(row.blockers.length||!row.identity||!text(row.identity.remoteId,'目标身份',200)||!row.contextId)throw new Error('账号或发布能力未核实');
        id(row.contextId);
        if(task.revision!==row.revision||task.accountId!==row.accountId||task.assetId!==row.assetId||task.assetSha256!==row.assetSha256||task.title!==row.title||task.description!==row.description||JSON.stringify(task.tags)!==JSON.stringify(row.tags))throw new Error('任务已变化，请重新核对');
        const asset=this.db.prepare('SELECT sha256,data FROM assets WHERE id=?').get(task.assetId) as any;
        if(!asset||asset.sha256!==row.assetSha256||JSON.parse(asset.data).availability!=='ready')throw new Error('素材文件不可用，请重新导入后核对');
      }
      const batch:PublishBatch={id:randomUUID(),reviewId,taskIds:rows.map(r=>r.taskId),state:'running'};
      this.db.prepare('INSERT INTO publish_batches VALUES(?,?,?)').run(batch.id,reviewId,JSON.stringify(batch));
      for(const row of rows){
        const attempt:AttemptRecord={id:randomUUID(),taskId:row.taskId,batchId:batch.id,revision:row.revision,targetRemoteId:row.identity!.remoteId,contextId:row.contextId!,adapterVersion:(row as PublishReviewRow & {adapterVersion?:string}).adapterVersion||'unverified',snapshot:structuredClone(row),phase:'reserved',outcome:'none',createdAt:new Date().toISOString()};
        this.db.prepare('INSERT INTO publish_attempts VALUES(?,?,?,?,?,?)').run(attempt.id,attempt.taskId,batch.id,attempt.phase,attempt.outcome,JSON.stringify(attempt));
        this.writeTask({...this.task(row.taskId),status:'pending'});this.event(row.taskId,'confirmed','已确认本次发布内容',attempt.id);
      }
      return batch;
    })();
  }
  getBatch(batchId:string):PublishBatch {
    const row=this.db.prepare('SELECT data FROM publish_batches WHERE id=?').get(id(batchId)) as any;
    if(!row)throw new Error('发布批次不存在');return JSON.parse(row.data);
  }
  listBatches():PublishBatch[]{
    return (this.db.prepare("SELECT data FROM publish_batches WHERE json_extract(data,'$.state')!='completed' OR id IN(SELECT id FROM publish_batches WHERE json_extract(data,'$.state')='completed' ORDER BY rowid DESC LIMIT 20) ORDER BY rowid DESC").all() as {data:string}[]).map(row=>JSON.parse(row.data));
  }
  private writeBatch(batch:PublishBatch):PublishBatch { this.db.prepare('UPDATE publish_batches SET data=? WHERE id=?').run(JSON.stringify(batch),batch.id);return batch; }
  findBatchForReview(reviewId:string):PublishBatch|null{
    const row=this.db.prepare('SELECT data FROM publish_batches WHERE review_id=?').get(id(reviewId)) as any;
    return row?JSON.parse(row.data):null;
  }
  pauseBatch(batchId:string):PublishBatch {
    return this.db.transaction(()=>{
      const batch=this.getBatch(batchId);if(batch.state==='completed')return batch;
      for(const taskId of batch.taskIds){
        const attempt=this.getAttempt(taskId);
        if(attempt?.batchId===batch.id&&attempt.phase==='reserved'){
          this.writeAttempt({...attempt,phase:'finished',outcome:'not_submitted'});
          this.event(taskId,'batch_paused','批次暂停：未开始的任务等待重新核对',attempt.id);
        }
      }
      return this.writeBatch({...batch,state:'paused'});
    })();
  }
  completeBatch(batchId:string):PublishBatch{
    const batch=this.getBatch(batchId);
    if(batch.taskIds.some(taskId=>!['submitted','published','rejected','cancelled'].includes(this.task(taskId).status)))throw new Error('批次仍有未完成任务');
    return this.writeBatch({...batch,state:'completed'});
  }
  beginPreparation(attemptId:string):void {
    this.db.transaction(()=>{
      const attempt=this.attempt(attemptId),task=this.task(attempt.taskId);
      if(attempt.phase!=='reserved'||task.status!=='pending'||task.revision!==attempt.revision)throw new Error('任务不能开始，请重新核对');
      this.writeAttempt({...attempt,phase:'preparing'});this.writeTask({...task,status:'running'});this.event(task.id,'preparing','正在核实账号并准备素材',attempt.id);
    })();
  }
  beginSubmit(attemptId:string):void {
    this.db.transaction(()=>{
      const attempt=this.attempt(attemptId),task=this.task(attempt.taskId);
      if(attempt.phase!=='preparing'||task.status!=='running'||task.revision!==attempt.revision)throw new Error('任务不能提交，请重新核对');
      this.writeAttempt({...attempt,phase:'submit_intent'});this.event(task.id,'submit_intent','准备向平台提交，结果需核实',attempt.id);
    })();
  }
  finishAttempt(attemptId:string,outcome:{kind:'not_submitted'|'review';errorCode:string}):void {
    this.db.transaction(()=>{
      const attempt=this.attempt(attemptId);
      if(attempt.phase==='finished'){if(attempt.outcome===outcome.kind)return;throw new Error('不能覆盖已记录的结果');}
      if(outcome.kind==='review' ? attempt.phase!=='submit_intent' : attempt.phase==='submit_intent')throw new Error('提交阶段不能按未提交处理');
      const task=this.task(attempt.taskId);
      this.writeAttempt({...attempt,phase:'finished',outcome:outcome.kind});
      this.writeTask({...task,status:outcome.kind==='review'?'review':outcome.errorCode==='LOGIN_REQUIRED'?'waiting_login':outcome.errorCode==='APP_CLOSING'?'pending':'failed'});
      this.event(task.id,outcome.kind,outcome.kind==='review'?'提交结果不明确，请先核对官方记录':'本次未提交，请检查条件后重新核对',attempt.id);
    })();
  }
  recordReceipt(attemptId:string,input:PublicationReceipt):void {
    const data=record(input,['remoteWorkId','accountRemoteId','officialUrl','state','observedAt']);
    const remoteWorkId=text(data.remoteWorkId,'作品标识',200),accountRemoteId=text(data.accountRemoteId,'目标身份',200);
    let url:URL;try{url=new URL(String(data.officialUrl));}catch{throw new Error('作品链接无效');}
    if(url.protocol!=='https:'||url.hostname!=='creator.douyin.com'||url.port||url.username||url.password||url.search||url.hash)throw new Error('作品链接不是已验证的官方地址');
    if(!['pending_review','published','rejected','restricted'].includes(String(data.state))||typeof data.observedAt!=='string'||!Number.isFinite(Date.parse(data.observedAt)))throw new Error('作品回执无效');
    const receipt:PublicationReceipt={remoteWorkId,accountRemoteId,officialUrl:url.href,state:data.state as PublicationReceipt['state'],observedAt:data.observedAt};
    this.db.transaction(()=>{
      const attempt=this.attempt(attemptId);
      if(this.getAttempt(attempt.taskId)?.id!==attempt.id||!['submit_intent','finished'].includes(attempt.phase)||attempt.outcome==='not_submitted')throw new Error('回执不属于当前提交尝试');
      if(attempt.targetRemoteId!==receipt.accountRemoteId || (attempt.receipt&&attempt.receipt.remoteWorkId!==receipt.remoteWorkId))throw new Error('作品回执与目标账号或原作品不一致');
      const duplicate=this.db.prepare("SELECT id FROM publish_attempts WHERE id!=? AND json_extract(data,'$.targetRemoteId')=? AND json_extract(data,'$.receipt.remoteWorkId')=?").get(attempt.id,receipt.accountRemoteId,receipt.remoteWorkId);
      if(duplicate)throw new Error('作品回执已关联其他任务，请重新核对');
      const task=this.task(attempt.taskId);
      this.writeAttempt({...attempt,phase:'finished',outcome:'submitted',receipt});
      const status=receipt.state==='pending_review'?'submitted':receipt.state==='published'?'published':'rejected';
      this.writeTask({...task,status,receipt});this.event(task.id,'receipt',status==='submitted'?'已确认提交，等待平台审核':status==='published'?'已核实官方发布结果':'已观察到平台发布限制或审核结果',attempt.id);
    })();
  }
  recordManualCheck(input:ManualCheckInput):PublishTaskDetails {
    const data=record(input,['taskId','attemptId','result','note']);const taskId=id(data.taskId),attemptId=id(data.attemptId),note=text(data.note,'核对说明',1000,true);
    if(!['found','not_found'].includes(String(data.result)))throw new Error('核对结果无效');
    return this.db.transaction(()=>{
      const task=this.task(taskId),attempt=this.getAttempt(taskId);
      if(task.status!=='review'||attempt?.id!==attemptId||attempt.outcome!=='review')throw new Error('仅当前待核对尝试可记录人工结果');
      this.db.prepare('INSERT INTO publish_manual_checks(task_id,attempt_id,result,note,created_at) VALUES(?,?,?,?,?)').run(taskId,attemptId,data.result,note,new Date().toISOString());
      this.event(taskId,'manual_check',data.result==='found'?'人工记录：已找到作品（尚未自动核实）':'人工记录：确认未发布（重新发布仍需确认）',attemptId);return this.getDetails(taskId);
    })();
  }
  createRepostDraft(input:RepostDraftInput):DesktopTask {
    const data=record(input,['previousTaskId','expectedRevision','acknowledged']);
    if(data.acknowledged!==true||!Number.isInteger(data.expectedRevision))throw new Error('请明确确认创建新的发布意图');
    return this.db.transaction(()=>{
      const old=this.task(id(data.previousTaskId));
      if(old.revision!==data.expectedRevision||!['published','rejected'].includes(old.status)||!old.receipt)throw new Error('该任务不能创建重发草稿，请先核对结果');
      if(this.db.prepare("SELECT id FROM tasks WHERE account_id=? AND asset_id=? AND status IN ('pending','waiting_login','running','submitted','review')").get(old.accountId,old.assetId))throw new Error('已有未完成任务，请先处理');
      const asset=this.db.prepare('SELECT sha256,data FROM assets WHERE id=?').get(old.assetId) as any;
      if(!asset||asset.sha256!==old.assetSha256||JSON.parse(asset.data).availability!=='ready')throw new Error('素材不可用，请重新导入并核对');
      const {receipt,...snapshot}=old;
      const task:DesktopTask={...snapshot,id:randomUUID(),status:'pending',revision:1,repostOf:old.id};
      this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?)').run(task.id,task.accountId,task.assetId,task.status,JSON.stringify(task));this.event(task.id,'repost_created','用户明确创建重发草稿，尚未发布');return task;
    })();
  }
  recoverInterrupted():void {
    this.db.transaction(()=>{
      const rows=this.db.prepare("SELECT id FROM publish_attempts WHERE phase!='finished'").all() as {id:string}[];
      for(const row of rows){
        const attempt=this.attempt(row.id),task=this.task(attempt.taskId),uncertain=attempt.phase==='submit_intent';
        this.writeAttempt({...attempt,phase:'finished',outcome:uncertain?'review':'not_submitted'});
        this.writeTask({...task,status:uncertain?'review':task.status==='cancelled'?'cancelled':'pending'});
        this.event(task.id,'recovered',uncertain?'重启恢复：提交可能已发生，请先核对':'重启恢复：尚未提交，等待重新核对',attempt.id);
      }
      for(const row of this.db.prepare('SELECT data FROM publish_batches').all() as any[]){
        const batch:PublishBatch=JSON.parse(row.data);if(batch.state==='running')this.writeBatch({...batch,state:'paused'});
      }
    })();
  }
}
