import{randomUUID}from'node:crypto';
import type{Page}from'playwright-core';
import type{Identity}from'../../shared/desktop-contracts.js';
import type{CommentListInput,CommentWorkspace,CommentSummary,CommentDetails,CommentDraftInput,CommentDraft,CommentRecord,CommentRecordInput,CommentSyncState,CommentReplyReview,CommentReplyCheckInput}from'../../shared/comments-contracts.js';
import type{Repository}from'../storage/repository.js';
import type{SessionManager}from'../browser/session-manager.js';
import type{OperationCoordinator}from'../publishing/coordinator.js';
import type{CommentsAdapter,CommentObservation}from'./adapter.js';
import{CommentStore,exactText,remoteId,observedComment,matchesReplyTarget,officialCommentUrl}from'./store.js';
import{id,record}from'../validation.js';
export type CommentBudgets={observeMs:number;readMs:number;prepareMs:number;submitMs:number};
const defaults:CommentBudgets={observeMs:15000,readMs:15000,prepareMs:60000,submitMs:30000};
class CommentsBlocked extends Error{constructor(readonly code:string,message:string){super(message);}}
export class CommentsService{
 private closing=false;
 private reviews=new Map<string,CommentReplyReview>();
 private sends=new Map<string,Promise<CommentDetails>>();
 private replyControllers=new Map<string,{commentId:string;controller:AbortController}>();
 private jobs=new Set<Promise<unknown>>();
 private syncs=new Map<string,Promise<CommentSyncState>>();
 private controllers=new Set<AbortController>();
 constructor(private store:CommentStore,private repository:Repository,private sessions:SessionManager,private coordinator:OperationCoordinator,private adapter:CommentsAdapter,private now:()=>number=Date.now,private budgets:CommentBudgets=defaults){}
 private requireOpen():void{if(this.closing)throw new CommentsBlocked('APP_CLOSING','应用正在关闭');}
 private track<T>(work:Promise<T>):Promise<T>{let owned:Promise<T>;owned=work.finally(()=>this.jobs.delete(owned));this.jobs.add(owned);return owned;}
 private async bounded<T>(accountId:string,ms:number,action:()=>Promise<T>,onTimeout?:()=>void):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined,expired=false,shutdown:Promise<void>|undefined;
  const operation=Promise.resolve().then(action);
  const deadline=new Promise<T>((_resolve,reject)=>{timer=setTimeout(()=>{
   expired=true;try{onTimeout?.();}catch{/* durable intent stays conservative */}
   shutdown=Promise.resolve().then(()=>this.sessions.close(accountId));
   void shutdown.then(()=>operation.catch(()=>undefined)).then(()=>reject(new CommentsBlocked('OPERATION_TIMEOUT','站点操作超时，请核对账号与结果')),reject);
  },ms);});
  try{const result=await Promise.race([operation,deadline]);if(expired)throw new CommentsBlocked('OPERATION_TIMEOUT','站点操作超时，请核对账号与结果');return result;}
  catch(error){if(expired)throw new CommentsBlocked('OPERATION_TIMEOUT','站点操作超时，请核对账号与结果');throw error;}
  finally{clearTimeout(timer);if(expired)await Promise.allSettled([shutdown,operation]);}
 }
 private live(accountId:string,observed:CommentObservation):Identity{
  try{
   const identity=observed.identity;if(!identity)throw new Error();remoteId(identity.remoteId);exactText(identity.displayName,'身份名称',200);exactText(observed.version,'能力版本',200);
   if(typeof identity.observedAt!=='string'||!Number.isFinite(Date.parse(identity.observedAt)))throw new Error();
   if(typeof observed.canRead!=='boolean'||typeof observed.canReply!=='boolean')throw new Error();
   const account=this.repository.getAccount(accountId);if(!account||(account.identity&&account.identity.remoteId!==identity.remoteId))throw new Error();
   if(this.repository.snapshot().accounts.some(a=>a.id!==accountId&&a.identity?.remoteId===identity.remoteId))throw new Error();
   this.repository.recordConnection({accountId,status:'logged_in',identity});return identity;
  }catch{throw new CommentsBlocked('LOGIN_REQUIRED','当前身份尚未核实或与账号绑定不一致');}
 }
 private async observe(accountId:string,page:Page,contextId:string):Promise<CommentObservation>{
  this.requireOpen();return this.sessions.withAccountPage(accountId,async(current,currentId)=>{
   if(current!==page||currentId!==contextId)throw new CommentsBlocked('LOGIN_REQUIRED','账号窗口已变化，请重新核对');
   return this.bounded(accountId,this.budgets.observeMs,()=>this.adapter.observe(page));
  });
 }
 async getCommentWorkspace(input:CommentListInput):Promise<CommentWorkspace>{
  this.requireOpen();this.store.list(input);
  const capabilities=this.repository.snapshot().accounts.map(a=>({accountId:a.id,read:false,reply:false,reason:'请选择账号检查当前评论能力'}));
  if(input.accountId){const accountId=id(input.accountId),cap=capabilities.find(c=>c.accountId===accountId)!;
   await this.track(this.coordinator.run(async()=>{
    this.requireOpen();try{await this.sessions.withAccountPage(accountId,async(page,contextId)=>{
     const observation=await this.observe(accountId,page,contextId);this.live(accountId,observation);cap.read=observation.canRead;cap.reply=observation.canReply;cap.reason=cap.read||cap.reply?'当前账号能力已检查':'评论读取和回复接入待验证';
    });}catch{cap.reason='评论读取和回复待验证，请先打开账号窗口核实身份';}
   }));
  }
  return{...this.store.list(input),sync:this.store.syncStates(),capabilities};
 }
 getCommentSummary():CommentSummary{return this.store.summary();}
 getCommentDetails(commentId:string):CommentDetails{return this.store.details(commentId);}
 saveCommentDraft(input:CommentDraftInput):CommentDraft{this.requireOpen();return this.store.saveDraft(input);}
 markCommentProcessed(input:{commentId:string;processed:boolean}):CommentRecord{this.requireOpen();return this.store.markProcessed(input);}
 async syncComments(input:{accountId:string}):Promise<CommentSyncState>{
  this.requireOpen();const r=record(input,['accountId']),accountId=id(r.accountId);if(!this.repository.getAccount(accountId))throw new Error('账号不存在');
  const existing=this.syncs.get(accountId);if(existing)return existing;
  const operation=this.track(this.coordinator.run(async()=>{
   this.requireOpen();this.store.startSync(accountId);const controller=new AbortController();this.controllers.add(controller);
   try{return await this.sessions.withAccountPage(accountId,async(page,contextId)=>{
    const initial=await this.observe(accountId,page,contextId),owner=this.live(accountId,initial);
    if(initial.canRead!==true)throw new CommentsBlocked('CAPABILITY_UNVERIFIED','评论读取接入待验证');
    const rows:CommentRecordInput[]=[],seen=new Set<string>();let cursor=this.store.cursor(accountId);if(cursor!==null)seen.add(cursor);
    let coverage:'partial'|'end'='partial';
    for(let index=0;index<10;index++){
     this.requireOpen();const before=await this.observe(accountId,page,contextId);const identity=this.live(accountId,before);
     if(identity.remoteId!==owner.remoteId||before.version!==initial.version||before.canRead!==true)throw new CommentsBlocked('LOGIN_REQUIRED','当前账号或评论能力已变化');
     const raw=await this.bounded(accountId,this.budgets.readMs,()=>this.adapter.readComments(page,cursor,controller.signal));
     const value=record(raw,['comments','nextCursor','coverage']);
     if(!Array.isArray(value.comments)||value.comments.length>200||!['partial','end'].includes(String(value.coverage)))throw new Error('评论页范围无效');
     const next=value.nextCursor===null?null:exactText(value.nextCursor,'分页标识',8192);
     if(value.coverage==='partial'&&(!next||seen.has(next)))throw new Error('分页标识循环或缺失');
     const parsed=value.comments.map(observedComment);if(parsed.some(row=>row.ownerRemoteId!==owner.remoteId))throw new Error('评论归属不匹配');
     const after=await this.observe(accountId,page,contextId);const current=this.live(accountId,after);
     if(current.remoteId!==owner.remoteId||after.version!==initial.version||after.canRead!==true)throw new CommentsBlocked('LOGIN_REQUIRED','读取期间账号或评论能力已变化');
     rows.push(...parsed);coverage=value.coverage as 'partial'|'end';cursor=next;if(coverage==='end')break;if(next)seen.add(next);
    }
    this.requireOpen();return this.store.completeSync(accountId,owner.remoteId,rows,cursor,coverage);
   });}catch(error){return this.store.failSync(accountId,error instanceof CommentsBlocked?error.code:'READ_FAILED');}
   finally{this.controllers.delete(controller);}
  }));
  this.syncs.set(accountId,operation);try{return await operation;}finally{this.syncs.delete(accountId);}
 }
 private replyBase(commentId:string):CommentReplyReview{
  const{comment:c,draft:d}=this.store.details(commentId),now=this.now();
  return{id:randomUUID(),commentId:c.id,accountId:c.accountId,sourceRevision:c.sourceRevision,draftRevision:d.revision,ownerRemoteId:c.ownerRemoteId,remoteWorkId:c.remoteWorkId,remoteThreadId:c.remoteThreadId,remoteCommentId:c.remoteCommentId,authorRemoteId:c.authorRemoteId,authorName:c.authorName,sourceText:c.text,text:d.text,identity:null,contextId:null,capabilityVersion:'unverified',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString(),blockers:[]};
 }
 private async checkReplyTarget(review:CommentReplyReview,page:Page,contextId:string,initial=false):Promise<void>{
  this.requireOpen();await this.sessions.withAccountPage(review.accountId,async(current,currentId)=>{
   if(current!==page||currentId!==contextId||(!initial&&review.contextId!==contextId))throw new CommentsBlocked('LOGIN_REQUIRED','当前账号窗口已变化');
   const raw=await this.bounded(review.accountId,this.budgets.observeMs,()=>this.adapter.observeReplyTarget(page,review));
   const identity=this.live(review.accountId,raw.observation);
   if(identity.remoteId!==review.ownerRemoteId||raw.observation.canReply!==true)throw new CommentsBlocked('CAPABILITY_UNVERIFIED','目标身份不匹配或评论回复接入待验证');
   if(!initial&&raw.observation.version!==review.capabilityVersion)throw new CommentsBlocked('CAPABILITY_UNVERIFIED','评论回复能力已变化，请重新核对');
   if(!raw.comment||!matchesReplyTarget(observedComment(raw.comment),review))throw new CommentsBlocked('SOURCE_CHANGED','源评论、作品或稳定作者标识已变化，请重新同步后核对');
   // Check the context again after the asynchronous DOM observation, without another site action.
   await this.sessions.withAccountPage(review.accountId,async(latest,latestId)=>{if(latest!==page||latestId!==contextId)throw new CommentsBlocked('LOGIN_REQUIRED','账号窗口已关闭或重新打开');});
   if(initial){review.identity=identity;review.contextId=contextId;review.capabilityVersion=raw.observation.version;}
  });
 }
 async reviewCommentReply(input:{commentId:string}):Promise<CommentReplyReview>{
  this.requireOpen();const r=record(input,['commentId']),commentId=id(r.commentId);this.store.details(commentId);
  return this.track(this.coordinator.run(async()=>{
   this.requireOpen();const review=this.replyBase(commentId),details=this.store.details(commentId);
   if(!review.text.trim())review.blockers.push({code:'EMPTY_DRAFT',message:'请先保存完整回复草稿'});
   if(details.comment.availability!=='present')review.blockers.push({code:'SOURCE_UNAVAILABLE',message:'源评论已删除或当前类型不支持回复'});
   if(details.replyState==='sending'||details.replyState==='sent'||(details.replyState==='review'&&details.manualCheck?.result!=='not_found'))review.blockers.push({code:'REPLY_HISTORY',message:'已有发送或待核对记录，不能直接再次发送'});
   try{await this.sessions.withAccountPage(review.accountId,(page,contextId)=>this.checkReplyTarget(review,page,contextId,true));}
   catch(error){review.blockers.push({code:error instanceof CommentsBlocked?error.code:'CAPABILITY_UNVERIFIED',message:error instanceof CommentsBlocked?error.message:'评论回复接入待验证，请先核实账号与官方评论页面'});}
   this.requireOpen();const now=this.now();review.createdAt=new Date(now).toISOString();review.expiresAt=new Date(now+300000).toISOString();
   for(const[key,old]of this.reviews)if(Date.parse(old.expiresAt)<=now)this.reviews.delete(key);
   this.reviews.set(review.id,structuredClone(review));return structuredClone(review);
  }));
 }
 async sendCommentReply(input:{reviewId:string}):Promise<CommentDetails>{
  this.requireOpen();const r=record(input,['reviewId']),reviewId=id(r.reviewId),existing=this.store.replyForReview(reviewId);
  if(existing){const pending=this.sends.get(reviewId);return pending||this.store.details(existing.commentId);}
  const pending=this.sends.get(reviewId);if(pending)return pending;
  const operation=this.track(this.coordinator.run(async()=>{
   this.requireOpen();const review=this.reviews.get(reviewId);
   if(!review||Date.parse(review.expiresAt)<=this.now())throw new Error('回复核对已过期，请重新核对');
   if(review.blockers.length)throw new Error('此条回复仍有阻塞原因，请先处理');this.store.assertReplySnapshot(review);
   return this.sessions.withAccountPage(review.accountId,async(page,contextId)=>{
    await this.checkReplyTarget(review,page,contextId);this.requireOpen();
    if(Date.parse(review.expiresAt)<=this.now())throw new Error('回复核对已过期，请重新核对');
    const attempt=this.store.reserveReply(review),controller=new AbortController();this.replyControllers.set(attempt.id,{commentId:attempt.commentId,controller});
    try{
     await this.bounded(review.accountId,this.budgets.prepareMs,()=>this.adapter.prepareReply(page,review,controller.signal));
     await this.checkReplyTarget(review,page,contextId);this.requireOpen();this.store.beginReplySubmit(attempt.id);
     const receipt=await this.bounded(review.accountId,this.budgets.submitMs,()=>this.adapter.submitReply(page,review),()=>this.store.finishReply(attempt.id,{kind:'review'}));
     if(!receipt)throw new CommentsBlocked('RESULT_UNKNOWN','未取得唯一回复回执');this.store.recordReplyReceipt(attempt.id,receipt);
    }catch{const current=this.store.getReplyAttempt(attempt.commentId);if(current?.id===attempt.id&&current.phase!=='finished')this.store.finishReply(attempt.id,{kind:current.phase==='submit_intent'?'review':'not_sent'});}
    finally{this.replyControllers.delete(attempt.id);}
    return this.store.details(attempt.commentId);
   });
  }));
  this.sends.set(reviewId,operation);try{return await operation;}finally{this.sends.delete(reviewId);}
 }
 async recheckCommentReply(commentId:string):Promise<CommentDetails>{
  this.requireOpen();const details=this.store.details(commentId),attempt=this.store.getReplyAttempt(commentId);
  if(!attempt||!['review','sent'].includes(details.replyState))throw new Error('此条评论没有可核对的发送记录');
  return this.track(this.coordinator.run(()=>this.sessions.withAccountPage(details.comment.accountId,async(page,contextId)=>{
   const identity=this.live(details.comment.accountId,await this.observe(details.comment.accountId,page,contextId));if(identity.remoteId!==attempt.snapshot.ownerRemoteId)throw new Error('当前身份与原发送账号不一致');
   const receipt=await this.bounded(details.comment.accountId,this.budgets.readMs,()=>this.adapter.readReplyResult(page,attempt));if(receipt)this.store.recordReplyReceipt(attempt.id,receipt);return this.store.details(commentId);
  })));
 }
 recordCommentReplyCheck(input:CommentReplyCheckInput):CommentDetails{this.requireOpen();return this.store.recordReplyCheck(input);}
 async openCommentPage(commentId:string):Promise<void>{
  this.requireOpen();const comment=this.store.comment(commentId),target=this.adapter.commentUrl(comment);if(!target)throw new Error('官方评论入口待验证，请在该账号登录窗口中查看');const url=officialCommentUrl(target);
  await this.track(this.coordinator.run(()=>this.sessions.withAccountPage(comment.accountId,async(page,contextId)=>{
   const identity=this.live(comment.accountId,await this.observe(comment.accountId,page,contextId));if(identity.remoteId!==comment.ownerRemoteId)throw new Error('当前身份与评论归属不一致');await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});
  })));
 }
 async close():Promise<void>{
  this.closing=true;for(const controller of this.controllers)controller.abort();
  for(const[attemptId,active]of this.replyControllers)if(this.store.getReplyAttempt(active.commentId)?.phase!=='submit_intent')active.controller.abort();
  await Promise.allSettled([...this.jobs]);
 }
}
