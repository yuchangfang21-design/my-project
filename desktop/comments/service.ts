import type{Page}from'playwright-core';
import type{Identity}from'../../shared/desktop-contracts.js';
import type{CommentListInput,CommentWorkspace,CommentSummary,CommentDetails,CommentDraftInput,CommentDraft,CommentRecord,CommentRecordInput,CommentSyncState}from'../../shared/comments-contracts.js';
import type{Repository}from'../storage/repository.js';
import type{SessionManager}from'../browser/session-manager.js';
import type{OperationCoordinator}from'../publishing/coordinator.js';
import type{CommentsAdapter,CommentObservation}from'./adapter.js';
import{CommentStore,exactText,remoteId,observedComment}from'./store.js';
import{id,record}from'../validation.js';
export type CommentBudgets={observeMs:number;readMs:number;prepareMs:number;submitMs:number};
const defaults:CommentBudgets={observeMs:15000,readMs:15000,prepareMs:60000,submitMs:30000};
class CommentsBlocked extends Error{constructor(readonly code:string,message:string){super(message);}}
export class CommentsService{
 private closing=false;
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
 async close():Promise<void>{this.closing=true;for(const controller of this.controllers)controller.abort();await Promise.allSettled([...this.jobs]);}
}
