import type Database from 'better-sqlite3';
import{randomUUID}from'node:crypto';
import type{CommentRecord,CommentRecordInput,CommentDraft,CommentDraftInput,CommentListInput,CommentSyncState,CommentDetails,CommentSummary}from'../../shared/comments-contracts.js';
import{id,record}from'../validation.js';
export function exactText(value:unknown,label:string,max:number,empty=false):string{
 if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||value.includes('\0'))throw new Error(label+'无效');return value;
}
export function remoteId(value:unknown):string{const v=exactText(value,'远端标识',200);if(v!==v.trim())throw new Error('远端标识无效');return v;}
export function observedComment(value:unknown):CommentRecordInput{
 const r=record(value,['ownerRemoteId','remoteWorkId','remoteThreadId','remoteCommentId','authorRemoteId','authorName','text','remoteCreatedAt','observedAt','availability']);
 const keys=['ownerRemoteId','remoteWorkId','remoteThreadId','remoteCommentId','authorRemoteId']as const;
 const identity=Object.fromEntries(keys.map(k=>[k,remoteId(r[k])])) as Pick<CommentRecordInput,typeof keys[number]>;
 if(!['present','removed','unsupported'].includes(String(r.availability)))throw new Error('评论类型无效');
 const dates=['remoteCreatedAt','observedAt'].map(k=>{if(typeof r[k]!=='string'||!Number.isFinite(Date.parse(r[k] as string)))throw new Error('评论时间无效');return new Date(r[k] as string).toISOString();});
 return{...identity,authorName:exactText(r.authorName,'作者名称',200),text:exactText(r.text,'评论正文',8000,r.availability!=='present'),remoteCreatedAt:dates[0],observedAt:dates[1],availability:r.availability as CommentRecordInput['availability']};
}
export class CommentStore{
 constructor(private db:Database.Database){}
 private account(accountId:string):string{const value=id(accountId);if(!this.db.prepare('SELECT id FROM accounts WHERE id=?').get(value))throw new Error('账号不存在');return value;}
 comment(commentId:string):CommentRecord{const row=this.db.prepare('SELECT data,processed FROM comments WHERE id=?').get(id(commentId)) as any;if(!row)throw new Error('评论不存在');return{...JSON.parse(row.data),processed:!!row.processed};}
 list(input:CommentListInput):{comments:CommentRecord[];total:number}{
  const r=record(input,['accountId','processed','query','offset','limit']);
  if(!Number.isSafeInteger(r.offset)||Number(r.offset)<0||!Number.isSafeInteger(r.limit)||Number(r.limit)<1||Number(r.limit)>100)throw new Error('列表范围无效');
  const where:string[]=[],args:unknown[]=[];
  if(r.accountId!==undefined){where.push('account_id=?');args.push(this.account(r.accountId as string));}
  if(r.processed!==undefined){if(typeof r.processed!=='boolean')throw new Error('处理状态无效');where.push('processed=?');args.push(Number(r.processed));}
  if(r.query!==undefined){const query=exactText(r.query,'搜索文字',200,true).trim();if(query){where.push("instr(json_extract(data,'$.authorName')||' '||json_extract(data,'$.text')||' '||remote_work_id||' '||remote_comment_id,?)>0");args.push(query);}}
  const clause=where.length?' WHERE '+where.join(' AND '):'';
  const total=(this.db.prepare('SELECT COUNT(*) AS n FROM comments'+clause).get(...args) as {n:number}).n;
  const rows=this.db.prepare('SELECT data,processed FROM comments'+clause+' ORDER BY observed_at DESC,id DESC LIMIT ? OFFSET ?').all(...args,r.limit,r.offset) as any[];
  return{comments:rows.map(row=>({...JSON.parse(row.data),processed:!!row.processed})),total};
 }
 summary():CommentSummary{
  const accounts=(this.db.prepare('SELECT id FROM accounts ORDER BY rowid').all() as {id:string}[]).map(a=>{const r=this.db.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(1-processed),0) AS unprocessed FROM comments WHERE account_id=?').get(a.id) as {total:number;unprocessed:number};return{accountId:a.id,...r};});
  return{total:accounts.reduce((n,a)=>n+a.total,0),unprocessed:accounts.reduce((n,a)=>n+a.unprocessed,0),accounts};
 }
 private event(commentId:string,kind:string,summary:string,attemptId:string|null=null):void{this.db.prepare('INSERT INTO comment_events(comment_id,attempt_id,kind,summary,created_at) VALUES(?,?,?,?,?)').run(commentId,attemptId,kind,summary,new Date().toISOString());}
 details(commentId:string):CommentDetails{
  const comment=this.comment(commentId),draft=JSON.parse((this.db.prepare('SELECT data FROM comment_drafts WHERE comment_id=?').get(comment.id) as {data:string}).data);
  const row=this.db.prepare('SELECT data,phase,outcome FROM comment_reply_attempts WHERE comment_id=? ORDER BY rowid DESC LIMIT 1').get(comment.id) as any;
  const attempt=row?{...JSON.parse(row.data),phase:row.phase,outcome:row.outcome}:null;
  const manual=attempt&&this.db.prepare('SELECT data FROM comment_reply_checks WHERE comment_id=? AND attempt_id=? ORDER BY id DESC LIMIT 1').get(comment.id,attempt.id) as any;
  const events=(this.db.prepare('SELECT * FROM comment_events WHERE comment_id=? ORDER BY id').all(comment.id) as any[]).map(r=>({id:r.id,commentId:r.comment_id,attemptId:r.attempt_id,kind:r.kind,summary:r.summary,createdAt:r.created_at}));
  return{comment,draft,replyState:!attempt?'draft':attempt.phase!=='finished'?'sending':attempt.outcome==='sent'?'sent':attempt.outcome==='review'?'review':'failed',latestAttemptId:attempt?.id||null,receipt:attempt?.receipt||null,events,manualCheck:manual?JSON.parse(manual.data):null};
 }
 saveDraft(input:CommentDraftInput):CommentDraft{
  const r=record(input,['commentId','expectedRevision','text']),commentId=id(r.commentId),body=exactText(r.text,'回复草稿',2000,true);
  if(!Number.isSafeInteger(r.expectedRevision)||Number(r.expectedRevision)<0)throw new Error('草稿修订无效');
  return this.db.transaction(()=>{
   const current=this.details(commentId).draft;
   if(this.db.prepare("SELECT id FROM comment_reply_attempts WHERE comment_id=? AND phase!='finished'").get(commentId))throw new Error('回复正在执行，暂时不能修改草稿');
   if(current.revision!==r.expectedRevision){if(current.revision===Number(r.expectedRevision)+1&&current.text===body)return current;throw new Error('草稿已变化，输入仍保留，请重新载入后再编辑');}
   if(current.text===body)return current;
   const next={commentId,revision:current.revision+1,text:body,updatedAt:new Date().toISOString()};this.db.prepare('UPDATE comment_drafts SET data=? WHERE comment_id=?').run(JSON.stringify(next),commentId);this.event(commentId,'draft_saved','保存本地回复草稿');return next;
  })();
 }
 markProcessed(input:{commentId:string;processed:boolean}):CommentRecord{
  const r=record(input,['commentId','processed']);if(typeof r.processed!=='boolean')throw new Error('处理状态无效');
  return this.db.transaction(()=>{const comment=this.comment(id(r.commentId));this.db.prepare('UPDATE comments SET processed=? WHERE id=?').run(Number(r.processed),comment.id);if(comment.processed!==r.processed)this.event(comment.id,'processed',r.processed?'标记已处理（本地）':'标记待处理（本地）');return{...comment,processed:r.processed as boolean};})();
 }
 private sync(accountId:string):CommentSyncState{
  this.account(accountId);const r=this.db.prepare('SELECT data FROM comment_sync WHERE account_id=?').get(accountId) as {data:string}|undefined;
  return r?JSON.parse(r.data):{accountId,state:'never',lastAttemptAt:null,lastSuccessAt:null,count:0,coverage:'unknown',errorCode:null};
 }
 syncStates():CommentSyncState[]{return(this.db.prepare('SELECT id FROM accounts ORDER BY rowid').all() as {id:string}[]).map(a=>this.sync(a.id));}
 cursor(accountId:string):string|null{this.account(accountId);return(this.db.prepare('SELECT cursor FROM comment_sync WHERE account_id=?').get(accountId) as {cursor:string|null}|undefined)?.cursor??null;}
 private writeSync(value:CommentSyncState,cursor:string|null):void{this.db.prepare('INSERT INTO comment_sync(account_id,data,cursor) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET data=excluded.data,cursor=excluded.cursor').run(value.accountId,JSON.stringify(value),cursor);}
 startSync(accountId:string):void{const old=this.sync(accountId);if(old.state==='syncing')throw new Error('该账号正在同步');this.writeSync({...old,state:'syncing',lastAttemptAt:new Date().toISOString(),errorCode:null},this.cursor(accountId));}
 completeSync(accountId:string,ownerRemoteId:string,rows:CommentRecordInput[],cursor:string|null,coverage:'partial'|'end'):CommentSyncState{
  this.account(accountId);remoteId(ownerRemoteId);
  if(!Array.isArray(rows)||rows.length>2000||!['partial','end'].includes(coverage)||(cursor!==null&&(typeof cursor!=='string'||!cursor||cursor.length>8192)))throw new Error('同步范围无效');
  return this.db.transaction(()=>{
   const state=this.sync(accountId);if(state.state!=='syncing')throw new Error('同步尚未开始');const keys=new Set<string>();
   for(const value of rows){
    const row=observedComment(value);if(row.ownerRemoteId!==ownerRemoteId)throw new Error('评论归属与当前账号不一致');
    const prior=this.db.prepare("SELECT id FROM comments WHERE account_id=? AND type='comment' AND remote_work_id=? AND remote_comment_id=?").get(accountId,row.remoteWorkId,row.remoteCommentId) as {id:string}|undefined;
    const old=prior?this.comment(prior.id):null;
    if(old&&['ownerRemoteId','remoteThreadId','authorRemoteId'].some(k=>(old as any)[k] !==(row as any)[k]))throw new Error('评论稳定归属已变化，不能重新绑定');
    const changed=old&&(['text','authorName','availability']as const).some(k=>old[k]!==row[k]);
    const next:CommentRecord={...row,id:old?.id||randomUUID(),accountId,type:'comment',sourceRevision:old?old.sourceRevision+(changed?1:0):1,processed:old?.processed||false};
    this.db.prepare('INSERT INTO comments(id,account_id,type,remote_work_id,remote_comment_id,data,processed,observed_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,observed_at=excluded.observed_at').run(next.id,accountId,'comment',row.remoteWorkId,row.remoteCommentId,JSON.stringify(next),Number(next.processed),row.observedAt);
    if(!old){const draft:CommentDraft={commentId:next.id,revision:0,text:'',updatedAt:new Date().toISOString()};this.db.prepare('INSERT INTO comment_drafts VALUES(?,?)').run(next.id,JSON.stringify(draft));this.event(next.id,'synced','读取到评论');}
    else if(changed)this.event(next.id,'source_changed','源评论已变化，发送前需重新核对');
    keys.add(next.id);
   }
   const next:CommentSyncState={...state,state:'success',lastSuccessAt:new Date().toISOString(),count:keys.size,coverage,errorCode:null};this.writeSync(next,cursor);return next;
  })();
 }
 failSync(accountId:string,errorCode:string):CommentSyncState{const old=this.sync(accountId),code=['LOGIN_REQUIRED','CAPABILITY_UNVERIFIED','OPERATION_TIMEOUT','APP_CLOSING','READ_FAILED'].includes(errorCode)?errorCode:'READ_FAILED';const next:CommentSyncState={...old,state:'failed',errorCode:code};this.writeSync(next,this.cursor(accountId));return next;}
 recoverInterrupted():void{this.db.transaction(()=>{for(const old of this.syncStates())if(old.state==='syncing')this.writeSync({...old,state:'interrupted',errorCode:'SYNC_INTERRUPTED'},this.cursor(old.accountId));})();}
}
