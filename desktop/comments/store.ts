import type Database from 'better-sqlite3';
import{randomUUID}from'node:crypto';
import type{CommentRecord,CommentRecordInput,CommentDraft,CommentDraftInput,CommentListInput,CommentSyncState,CommentDetails,CommentSummary,CommentReplyReview,CommentReplyReceipt,CommentReplyCheckInput}from'../../shared/comments-contracts.js';
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
export type CommentReplyAttempt={id:string;reviewId:string;commentId:string;phase:'reserved'|'submit_intent'|'finished';outcome:'none'|'not_sent'|'sent'|'review';snapshot:CommentReplyReview;receipt:CommentReplyReceipt|null;createdAt:string};
export function matchesReplyTarget(comment:CommentRecordInput,review:CommentReplyReview):boolean{
 return comment.availability==='present'&&comment.text===review.sourceText&&(['ownerRemoteId','remoteWorkId','remoteThreadId','remoteCommentId','authorRemoteId','authorName']as const).every(k=>comment[k]===review[k]);
}
export function officialCommentUrl(value:unknown):string{
 const raw=exactText(value,'官方评论链接',2048);let url:URL;try{url=new URL(raw);}catch{throw new Error('官方评论链接无效');}
 if(url.protocol!=='https:'||url.hostname!=='creator.douyin.com'||url.port||url.username||url.password||url.search||url.hash)throw new Error('评论入口不是已验证的官方地址');return url.href;
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
 private replyAttempt(attemptId:string):CommentReplyAttempt{
  const row=this.db.prepare('SELECT data,phase,outcome FROM comment_reply_attempts WHERE id=?').get(id(attemptId)) as any;if(!row)throw new Error('回复尝试不存在');return{...JSON.parse(row.data),phase:row.phase,outcome:row.outcome};
 }
 getReplyAttempt(commentId:string):CommentReplyAttempt|null{
  const row=this.db.prepare('SELECT id FROM comment_reply_attempts WHERE comment_id=? ORDER BY rowid DESC LIMIT 1').get(id(commentId)) as {id:string}|undefined;return row?this.replyAttempt(row.id):null;
 }
 replyForReview(reviewId:string):CommentReplyAttempt|null{
  const row=this.db.prepare('SELECT id FROM comment_reply_attempts WHERE review_id=?').get(id(reviewId)) as {id:string}|undefined;return row?this.replyAttempt(row.id):null;
 }
 private writeReply(value:CommentReplyAttempt):void{this.db.prepare('UPDATE comment_reply_attempts SET data=?,phase=?,outcome=? WHERE id=?').run(JSON.stringify(value),value.phase,value.outcome,value.id);}
 assertReplySnapshot(review:CommentReplyReview):void{
  const{comment,draft}=this.details(review.commentId);
  if(comment.accountId!==review.accountId||comment.sourceRevision!==review.sourceRevision||draft.revision!==review.draftRevision||draft.text!==review.text||!matchesReplyTarget(comment,review))throw new Error('源评论、目标或草稿已变化，请重新核对');
 }
 reserveReply(review:CommentReplyReview):CommentReplyAttempt{
  id(review.id);id(review.commentId);id(review.accountId);
  return this.db.transaction(()=>{
   const existing=this.replyForReview(review.id);if(existing){if(existing.commentId!==review.commentId)throw new Error('确认目标不一致');return existing;}
   if(review.blockers.length||!review.identity||review.identity.remoteId!==review.ownerRemoteId||!review.contextId||!review.capabilityVersion)throw new Error('回复身份或能力尚未核实');id(review.contextId);exactText(review.text,'回复内容',2000);
   this.assertReplySnapshot(review);const details=this.details(review.commentId);
   if(details.replyState==='sending'||details.replyState==='sent'||(details.replyState==='review'&&details.manualCheck?.result!=='not_found'))throw new Error('已有发送或待核对记录，不能再次发送');
   const attempt:CommentReplyAttempt={id:randomUUID(),reviewId:review.id,commentId:review.commentId,phase:'reserved',outcome:'none',snapshot:structuredClone(review),receipt:null,createdAt:new Date().toISOString()};
   this.db.prepare('INSERT INTO comment_reply_attempts VALUES(?,?,?,?,?,?)').run(attempt.id,attempt.reviewId,attempt.commentId,attempt.phase,attempt.outcome,JSON.stringify(attempt));this.event(attempt.commentId,'reply_confirmed','已确认此条评论的回复内容',attempt.id);return attempt;
  })();
 }
 beginReplySubmit(attemptId:string):void{this.db.transaction(()=>{
  const attempt=this.replyAttempt(attemptId);if(attempt.phase!=='reserved'||this.getReplyAttempt(attempt.commentId)?.id!==attempt.id)throw new Error('回复尝试不能提交');this.assertReplySnapshot(attempt.snapshot);
  this.writeReply({...attempt,phase:'submit_intent'});this.event(attempt.commentId,'reply_submit_intent','准备提交此条回复，结果需要核实',attempt.id);
 })();}
 finishReply(attemptId:string,outcome:{kind:'not_sent'|'review'}):void{this.db.transaction(()=>{
  const attempt=this.replyAttempt(attemptId);
  if(attempt.phase==='finished'){if(attempt.outcome===outcome.kind)return;throw new Error('不能覆盖已记录的回复结果');}
  if(outcome.kind==='review'?attempt.phase!=='submit_intent':attempt.phase==='submit_intent')throw new Error('不能把可能已提交的回复记为未发送');
  this.writeReply({...attempt,phase:'finished',outcome:outcome.kind});this.event(attempt.commentId,outcome.kind==='review'?'reply_review':'reply_failed',outcome.kind==='review'?'发送结果不明确，请先核对官方记录':'本次未发送，请检查账号、源评论和草稿后重新核对',attempt.id);
 })();}
 recordReplyReceipt(attemptId:string,input:CommentReplyReceipt):void{
  const r=record(input,['remoteReplyId','accountRemoteId','remoteWorkId','remoteThreadId','remoteCommentId','recipientRemoteId','state','officialUrl','observedAt']);
  const remoteReplyId=remoteId(r.remoteReplyId),accountRemoteId=remoteId(r.accountRemoteId),remoteWorkId=remoteId(r.remoteWorkId),remoteThreadId=remoteId(r.remoteThreadId),remoteCommentId=remoteId(r.remoteCommentId),recipientRemoteId=remoteId(r.recipientRemoteId),officialUrl=officialCommentUrl(r.officialUrl);
  if(r.state!=='sent'||typeof r.observedAt!=='string'||!Number.isFinite(Date.parse(r.observedAt)))throw new Error('回复回执无效');
  const receipt:CommentReplyReceipt={remoteReplyId,accountRemoteId,remoteWorkId,remoteThreadId,remoteCommentId,recipientRemoteId,state:'sent',officialUrl,observedAt:new Date(r.observedAt).toISOString()};
  this.db.transaction(()=>{
   const attempt=this.replyAttempt(attemptId),snapshot=attempt.snapshot;
   if(this.getReplyAttempt(attempt.commentId)?.id!==attempt.id||!['submit_intent','finished'].includes(attempt.phase)||attempt.outcome==='not_sent')throw new Error('回执不属于当前发送尝试');
   if(snapshot.ownerRemoteId!==accountRemoteId||snapshot.remoteWorkId!==remoteWorkId||snapshot.remoteThreadId!==remoteThreadId||snapshot.remoteCommentId!==remoteCommentId||snapshot.authorRemoteId!==recipientRemoteId||(attempt.receipt&&attempt.receipt.remoteReplyId!==remoteReplyId))throw new Error('回复回执与账号、源评论或作者不一致');
   if(this.db.prepare("SELECT id FROM comment_reply_attempts WHERE id!=? AND json_extract(data,'$.receipt.accountRemoteId')=? AND json_extract(data,'$.receipt.remoteReplyId')=?").get(attempt.id,accountRemoteId,remoteReplyId))throw new Error('该回复回执已关联其他尝试');
   this.writeReply({...attempt,phase:'finished',outcome:'sent',receipt});this.event(attempt.commentId,'reply_sent','已核实该条回复的官方发送结果',attempt.id);
  })();
 }
 recordReplyCheck(input:CommentReplyCheckInput):CommentDetails{
  const r=record(input,['commentId','attemptId','result','note']),commentId=id(r.commentId),attemptId=id(r.attemptId),note=exactText(r.note,'核对说明',1000,true);
  if(r.result!=='found'&&r.result!=='not_found')throw new Error('人工核对结果无效');
  return this.db.transaction(()=>{const attempt=this.getReplyAttempt(commentId);if(!attempt||attempt.id!==attemptId||attempt.phase!=='finished'||attempt.outcome!=='review')throw new Error('仅当前待核对尝试可记录人工结果');
   const data={result:r.result,note,createdAt:new Date().toISOString()};this.db.prepare('INSERT INTO comment_reply_checks(comment_id,attempt_id,data) VALUES(?,?,?)').run(commentId,attemptId,JSON.stringify(data));this.event(commentId,'reply_manual_check',r.result==='found'?'人工记录：已找到回复（尚未自动核实）':'人工记录：确认未发送（仍需重新核对）',attemptId);return this.details(commentId);
  })();
 }
 recoverInterrupted():void{this.db.transaction(()=>{
  for(const old of this.syncStates())if(old.state==='syncing')this.writeSync({...old,state:'interrupted',errorCode:'SYNC_INTERRUPTED'},this.cursor(old.accountId));
  const active=this.db.prepare("SELECT id FROM comment_reply_attempts WHERE phase!='finished'").all() as {id:string}[];
  for(const row of active){const old=this.replyAttempt(row.id),uncertain=old.phase==='submit_intent';this.writeReply({...old,phase:'finished',outcome:uncertain?'review':'not_sent'});this.event(old.commentId,'reply_recovered',uncertain?'重启恢复：发送可能已发生，请先核对':'重启恢复：本次尚未发送，等待重新核对',old.id);}
 })();}
}
