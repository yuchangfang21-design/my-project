import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright-core';
import type { DesktopTask, Identity } from '../../shared/desktop-contracts.js';
import type { PublishReview, PublishReviewRow, PublishBatch, PublishDraftInput, PublishTaskDetails, ManualCheckInput, RepostDraftInput } from '../../shared/publishing-contracts.js';
import type { Repository } from '../storage/repository.js';
import type { PublishStore, AttemptRecord } from '../storage/publish-store.js';
import type { MediaLibrary } from '../media/library.js';
import type { SessionManager } from '../browser/session-manager.js';
import type { PublishAdapter, PublishObservation } from './adapter.js';
import type { OperationCoordinator } from './coordinator.js';
import { verifiedWorkUrl } from './work-url.js';
import { PublishAdapterError } from './adapter-error.js';
import { id, record } from '../validation.js';

type Budgets={observeMs:number;prepareMs:number;submitMs:number;readMs:number};
const defaults:Budgets={observeMs:15000,prepareMs:600000,submitMs:30000,readMs:15000};
class Blocked extends Error {constructor(readonly code:string,message:string){super(message);}}
type ReviewRecord={review:PublishReview;versions:Map<string,string>};
export class PublishingService {
  private reviews=new Map<string,ReviewRecord>();
  private starts=new Map<string,Promise<PublishBatch>>();
  private runners=new Set<Promise<void>>();
  private active=new Map<string,{taskId:string;controller:AbortController}>();
  private closing=false;
  constructor(private store:PublishStore,private repository:Repository,private media:MediaLibrary,private sessions:SessionManager,private coordinator:OperationCoordinator,private adapter:PublishAdapter,private now:()=>number=Date.now,private budgets:Budgets=defaults){}
  get publicationMode():'not_connected'|'private_test'{return this.adapter.publicationMode||'not_connected';}
  private requireOpen():void{if(this.closing)throw new Blocked('APP_CLOSING','应用正在关闭');}
  private identity(value:Identity|null):value is Identity{
    return !!value&&typeof value.remoteId==='string'&&!!value.remoteId.trim()&&value.remoteId===value.remoteId.trim()&&value.remoteId.length<=200&&typeof value.displayName==='string'&&!!value.displayName.trim()&&value.displayName.length<=200&&typeof value.observedAt==='string'&&Number.isFinite(Date.parse(value.observedAt));
  }
  private async bounded<T>(accountId:string,ms:number,work:()=>Promise<T>,onTimeout?:()=>void):Promise<T>{
    let timer:ReturnType<typeof setTimeout>|undefined,expired=false,closing:Promise<void>|undefined;
    const operation=Promise.resolve().then(work);
    const deadline=new Promise<T>((_resolve,reject)=>{
      timer=setTimeout(()=>{
        expired=true;
        try{onTimeout?.();}catch{ /* preserve the existing durable intent */ }
        closing=this.sessions.close(accountId);
        void closing.then(()=>operation.catch(()=>undefined)).then(()=>reject(new Blocked('OPERATION_TIMEOUT','站点操作超时，请核对结果')),reject);
      },ms);
    });
    try{const result=await Promise.race([operation,deadline]);if(expired)throw new Blocked('OPERATION_TIMEOUT','站点操作超时，请核对结果');return result;}
    finally{clearTimeout(timer);if(expired){await closing;await operation.catch(()=>undefined);}}
  }
  private async observation(accountId:string,page:Page):Promise<PublishObservation>{
    return this.bounded(accountId,this.budgets.observeMs,()=>this.adapter.observe(page));
  }
  private validateLive(accountId:string,observation:PublishObservation):Identity{
    if(!this.identity(observation.identity))throw new Blocked('LOGIN_REQUIRED','账号身份尚未核实，请在官方窗口确认');
    const identity=observation.identity,known=this.repository.getAccount(accountId)?.identity;
    if(known&&known.remoteId!==identity.remoteId)throw new Blocked('LOGIN_REQUIRED','当前身份与已绑定账号不一致，请核对账号');
    if(this.repository.snapshot().accounts.some(a=>a.id!==accountId&&a.identity?.remoteId===identity.remoteId))throw new Blocked('LOGIN_REQUIRED','该身份已绑定另一个账号档案');
    this.repository.recordConnection({accountId,status:'logged_in',identity});
    return identity;
  }
  private async inspect(taskId:string):Promise<{row:PublishReviewRow;version:string}>{
    const task=this.store.task(taskId),details=this.store.getDetails(taskId),attempt=this.store.getAttempt(taskId);
    const row:PublishReviewRow={taskId:task.id,revision:task.revision,accountId:task.accountId,assetId:task.assetId,assetSha256:task.assetSha256,title:task.title,description:task.description,tags:[...task.tags],identity:null,contextId:null,blockers:[]};
    if(!['pending','waiting_login','failed'].includes(task.status)&&!(task.status==='review'&&details.manualCheck?.result==='not_found'))row.blockers.push({code:'TASK_STATE',message:'该任务需要先核对已有结果，不能直接发布'});
    if(attempt&&attempt.phase!=='finished')row.blockers.push({code:'ACTIVE_ATTEMPT',message:'该任务已在执行或排队，请先处理当前批次'});
    if(this.store.hasConflictingSubmissionHistory(task.id))row.blockers.push({code:'SUBMISSION_HISTORY',message:'同一账号和素材已有提交或待核对历史，请查看最新任务并明确创建新的发布意图'});
    try{await this.media.verifiedPath(task.assetId,task.assetSha256);}catch{row.blockers.push({code:'ASSET_UNAVAILABLE',message:'素材文件缺失、损坏或已变化，请重新导入后核对'});}
    let version='unverified';
    try{
      await this.sessions.withAccountPage(task.accountId,async(page,contextId)=>{
        row.contextId=contextId;
        const observation=await this.observation(task.accountId,page);version=observation.version;row.publicationMode=observation.publicationMode;
        if(row.publicationMode==='private_test'&&(task.title.length>30||task.description.length>1000||task.description!==task.description.trimEnd()||task.tags.length))row.blockers.push({code:'PRIVATE_COPY_UNSUPPORTED',message:'私密联调仅支持30字内标题、1000字内正文，无话题标签；正文末尾请勿留空白'});
        if(observation.canPublish!==true)row.blockers.push({code:'CAPABILITY_UNVERIFIED',message:observation.reason||'发布接入待验证：当前账号尚无可用的发布能力'});
        try{row.identity=this.validateLive(task.accountId,observation);}catch{row.blockers.push({code:'LOGIN_REQUIRED',message:'账号身份未核实或与原绑定不一致，请重新登录核对'});}
      });
    }catch{
      row.blockers.push({code:'LOGIN_REQUIRED',message:'请先打开该账号的登录窗口并核实身份'});
      if(!row.blockers.some(b=>b.code==='CAPABILITY_UNVERIFIED'))row.blockers.push({code:'CAPABILITY_UNVERIFIED',message:'发布接入待验证，当前账号窗口不可用'});
    }
    return{row,version};
  }
  async reviewPublish(input:{taskIds:string[]}):Promise<PublishReview>{
    this.requireOpen();const data=record(input,['taskIds']);
    if(!Array.isArray(data.taskIds)||!data.taskIds.length||data.taskIds.length>100)throw new Error('请选择 1—100 个不同任务');
    const ids=data.taskIds.map(id);if(new Set(ids).size!==ids.length)throw new Error('发布清单不能包含重复任务');
    ids.forEach(taskId=>this.store.task(taskId));
    return this.coordinator.run(async()=>{
      this.requireOpen();const rows:PublishReviewRow[]=[],versions=new Map<string,string>();
      for(const taskId of ids){const observed=await this.inspect(taskId);rows.push(observed.row);versions.set(taskId,observed.version);}
      if(rows.length>1&&rows.some(row=>row.publicationMode==='private_test'))for(const row of rows)row.blockers.push({code:'PRIVATE_SINGLE_ONLY',message:'首轮私密发布联调一次只能选择一个任务'});
      this.requireOpen();const created=this.now();
      for(const [key,value]of this.reviews)if(Date.parse(value.review.expiresAt)<=created)this.reviews.delete(key);
      const review:PublishReview={id:randomUUID(),createdAt:new Date(created).toISOString(),expiresAt:new Date(created+300000).toISOString(),rows,readyTaskIds:rows.filter(r=>!r.blockers.length).map(r=>r.taskId)};
      this.reviews.set(review.id,{review:structuredClone(review),versions});return structuredClone(review);
    });
  }
  async startPublish(input:{reviewId:string}):Promise<PublishBatch>{
    this.requireOpen();const data=record(input,['reviewId']),reviewId=id(data.reviewId);
    const existing=this.store.findBatchForReview(reviewId);if(existing)return existing;
    const running=this.starts.get(reviewId);if(running)return running;
    const start=this.startInternal(reviewId);this.starts.set(reviewId,start);
    try{return await start;}finally{this.starts.delete(reviewId);}
  }
  private async startInternal(reviewId:string):Promise<PublishBatch>{
    const batch=await this.coordinator.run(async()=>{
      this.requireOpen();const saved=this.reviews.get(reviewId);
      if(!saved||Date.parse(saved.review.expiresAt)<=this.now())throw new Error('核对清单已过期，请重新核对');
      const rows=saved.review.rows.filter(row=>saved.review.readyTaskIds.includes(row.taskId));
      if(!rows.length)throw new Error('没有可发布的任务，请先处理阻塞原因');
      for(const expected of rows){
        const current=await this.inspect(expected.taskId);
        if(current.row.blockers.length||current.row.publicationMode!==expected.publicationMode||current.row.revision!==expected.revision||current.row.assetSha256!==expected.assetSha256||current.row.identity?.remoteId!==expected.identity?.remoteId||current.row.contextId!==expected.contextId||current.version!==saved.versions.get(expected.taskId))throw new Error('任务、账号或发布能力已变化，请重新核对');
      }
      if(Date.parse(saved.review.expiresAt)<=this.now())throw new Error('核对清单已过期，请重新核对');
      this.requireOpen();return this.store.reserveBatch(reviewId,rows.map(row=>({...row,adapterVersion:saved.versions.get(row.taskId)})));
    });
    if(this.closing)return this.store.pauseBatch(batch.id);
    let runner:Promise<void>;
    runner=this.runBatch(batch.id).catch(()=>{this.store.pauseBatch(batch.id);}).finally(()=>this.runners.delete(runner));
    this.runners.add(runner);return batch;
  }
  private async checkLive(attempt:AttemptRecord,page:Page,contextId:string):Promise<void>{
    this.requireOpen();
    if(!attempt.snapshot||this.store.task(attempt.taskId).revision!==attempt.revision)throw new Blocked('TASK_CHANGED','任务已变化，请重新核对');
    const observed=await this.observation(attempt.snapshot.accountId,page),identity=this.validateLive(attempt.snapshot.accountId,observed);
    if(identity.remoteId!==attempt.targetRemoteId||contextId!==attempt.contextId)throw new Blocked('LOGIN_REQUIRED','当前账号窗口或身份已变化');
    if(observed.publicationMode!==attempt.snapshot.publicationMode||observed.canPublish!==true||observed.version!==attempt.adapterVersion)throw new Blocked('CAPABILITY_UNVERIFIED','发布能力已变化，请重新核对');
  }
  private async runBatch(batchId:string):Promise<void>{
    for(const taskId of this.store.getBatch(batchId).taskIds){
      if(this.closing||this.store.getBatch(batchId).state!=='running')return;
      if(this.store.task(taskId).status==='cancelled')continue;
      await this.coordinator.run(()=>this.executeTask(taskId,batchId));
    }
    if(!this.closing&&this.store.getBatch(batchId).state==='running')this.store.completeBatch(batchId);
  }
  private async executeTask(taskId:string,batchId:string):Promise<void>{
    const attempt=this.store.getAttempt(taskId);
    if(!attempt||attempt.batchId!==batchId||attempt.phase!=='reserved'||this.store.getBatch(batchId).state!=='running'||this.closing)return;
    const controller=new AbortController();this.active.set(attempt.id,{taskId,controller});
    try{
      this.store.beginPreparation(attempt.id);
      await this.sessions.withAccountPage(attempt.snapshot.accountId,async(page,contextId)=>{
        const file=await this.media.verifiedPath(attempt.snapshot.assetId,attempt.snapshot.assetSha256);
        await this.checkLive(attempt,page,contextId);
        await this.bounded(attempt.snapshot.accountId,this.budgets.prepareMs,()=>this.adapter.prepare(page,{attemptId:attempt.id,file,title:attempt.snapshot.title,description:attempt.snapshot.description,tags:attempt.snapshot.tags},controller.signal));
        await this.media.verifiedPath(attempt.snapshot.assetId,attempt.snapshot.assetSha256);
        await this.checkLive(attempt,page,contextId);
        this.requireOpen();this.store.beginSubmit(attempt.id);
        const receipt=await this.bounded(attempt.snapshot.accountId,this.budgets.submitMs,()=>this.adapter.submit(page),()=>{
          this.store.finishAttempt(attempt.id,{kind:'review',errorCode:'RESULT_UNKNOWN'});this.store.pauseBatch(batchId);
        });
        if(!receipt)throw new Blocked('RESULT_UNKNOWN','未取得可唯一核实的作品结果');
        this.store.recordReceipt(attempt.id,receipt);
      });
    }catch(error){
      const current=this.store.getAttempt(taskId);
      if(current?.id===attempt.id&&current.phase!=='finished')this.store.finishAttempt(attempt.id,{kind:current.phase==='submit_intent'?'review':'not_submitted',errorCode:this.closing?'APP_CLOSING':error instanceof Blocked||error instanceof PublishAdapterError?error.code:'PREPARE_FAILED'});
      this.store.pauseBatch(batchId);
    }finally{this.active.delete(attempt.id);}
  }
  async pausePublishing(batchId:string):Promise<PublishBatch>{this.requireOpen();return this.store.pauseBatch(batchId);}
  getPublishingBatch(batchId:string):PublishBatch{return this.store.getBatch(batchId);}
  getPublishingBatches():PublishBatch[]{return this.store.listBatches();}
  getPublishTaskDetails(taskId:string):PublishTaskDetails{return this.store.getDetails(taskId);}
  recordPublishCheck(input:ManualCheckInput):PublishTaskDetails{this.requireOpen();return this.store.recordManualCheck(input);}
  async updatePublishDraft(input:PublishDraftInput):Promise<DesktopTask>{
    this.requireOpen();const task=this.store.task(input?.taskId);await this.media.verifiedPath(task.assetId,task.assetSha256);return this.store.updateDraft(input);
  }
  async createRepostDraft(input:RepostDraftInput):Promise<DesktopTask>{
    this.requireOpen();const task=this.store.task(input?.previousTaskId);await this.media.verifiedPath(task.assetId,task.assetSha256);return this.store.createRepostDraft(input);
  }
  async recheckPublish(taskId:string):Promise<PublishTaskDetails>{
    this.requireOpen();const task=this.store.task(taskId),attempt=this.store.getAttempt(taskId);
    if(!attempt||!['review','submitted','published','rejected'].includes(task.status))throw new Error('当前任务没有可核对的提交记录');
    return this.coordinator.run(()=>this.sessions.withAccountPage(task.accountId,async(page)=>{
      const observed=await this.observation(task.accountId,page),identity=this.validateLive(task.accountId,observed);
      if(identity.remoteId!==attempt.targetRemoteId)throw new Error('当前账号与提交目标不一致');
      const receipt=await this.bounded(task.accountId,this.budgets.readMs,()=>this.adapter.readResult(page,attempt));
      if(receipt)this.store.recordReceipt(attempt.id,receipt);
      return this.store.getDetails(taskId);
    }));
  }
  async openPublishPage(taskId:string):Promise<void>{
    this.requireOpen();const task=this.store.task(taskId),attempt=this.store.getAttempt(taskId),target=task.receipt?.officialUrl||this.adapter.worksUrl;
    if(!target)throw new Error('官方作品页入口待验证，请在账号登录窗口中查看');
    const url=verifiedWorkUrl(target,task.receipt?.remoteWorkId);
    await this.coordinator.run(()=>this.sessions.withAccountPage(task.accountId,async(page)=>{
      const identity=this.validateLive(task.accountId,await this.observation(task.accountId,page));
      if(attempt&&identity.remoteId!==attempt.targetRemoteId)throw new Error('当前账号与任务目标不一致');
      if(url.hostname==='www.douyin.com'){const detail=await page.context().newPage();try{await detail.goto(url.href,{waitUntil:'domcontentloaded',timeout:15000});}catch(error){await detail.close();throw error;}}else await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:15000});
    }));
  }
  async close():Promise<void>{
    this.closing=true;
    for(const {taskId,controller}of this.active.values()){
      if(this.store.getAttempt(taskId)?.phase!=='submit_intent')controller.abort();
    }
    await Promise.allSettled([...this.starts.values(),...this.runners]);
  }
}
