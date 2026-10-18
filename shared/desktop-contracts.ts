export type LoginStatus = 'not_logged_in' | 'opening' | 'pending_confirmation' | 'logged_in' | 'expired';
export type Identity = { remoteId: string; displayName: string; observedAt: string };
export type LoginObservation = { accountId: string; status: LoginStatus; identity?: Identity; reason?: string };
export type CreateAccountInput = { name: string; handle?: string; group: string };
export type CreateTasksInput = { assetId: string; accountIds: string[]; title: string };
export type ImportReport = { added: number; repaired: number; duplicates: number; failures: { filename: string; reason: string }[] };
export interface DesktopAccount { id: string; name: string; handle: string; group: string; color: string; initial: string; demo: false; followers: string; loginStatus: LoginStatus; identity?: Identity }
export interface DesktopAsset { id: string; title: string; filename: string; poster: string; tag: string; duration: string; size: string; imported: true; sha256: string; availability?: 'ready' | 'missing' | 'corrupt' }
export interface DesktopTask { id: string; accountId: string; assetId: string; title: string; status: import('./publishing-contracts.js').PublishStatus; time: string; revision: number; description: string; tags: string[]; assetSha256: string; receipt?: import('./publishing-contracts.js').PublicationReceipt; repostOf?: string }
export interface WorkspaceSnapshot { version: 1; accounts: DesktopAccount[]; assets: DesktopAsset[]; tasks: DesktopTask[]; messages: [] }
export interface DesktopApi {
  getCommentWorkspace(input:import('./comments-contracts.js').CommentListInput):Promise<import('./comments-contracts.js').CommentWorkspace>;
  getCommentSummary():Promise<import('./comments-contracts.js').CommentSummary>;
  getCommentDetails(commentId:string):Promise<import('./comments-contracts.js').CommentDetails>;
  saveCommentDraft(input:import('./comments-contracts.js').CommentDraftInput):Promise<import('./comments-contracts.js').CommentDraft>;
  markCommentProcessed(input:{commentId:string;processed:boolean}):Promise<import('./comments-contracts.js').CommentRecord>;
  syncComments(input:{accountId:string}):Promise<import('./comments-contracts.js').CommentSyncState>;
  reviewCommentReply(input:{commentId:string}):Promise<import('./comments-contracts.js').CommentReplyReview>;
  sendCommentReply(input:{reviewId:string}):Promise<import('./comments-contracts.js').CommentDetails>;
  recheckCommentReply(commentId:string):Promise<import('./comments-contracts.js').CommentDetails>;
  recordCommentReplyCheck(input:import('./comments-contracts.js').CommentReplyCheckInput):Promise<import('./comments-contracts.js').CommentDetails>;
  openCommentPage(commentId:string):Promise<void>;
  registerCommentDraftFlush():Promise<void>;
  onCommentDraftFlush(listener:(requestId:string)=>void):()=>void;
  completeCommentDraftFlush(input:{requestId:string;ok:boolean}):Promise<void>;
  onCommentDraftCloseCanceled(listener:(event:{requestId:string;reason:string})=>void):()=>void;
  getRuntime(): Promise<{ mode: 'desktop'; version: string }>;
  getSnapshot(): Promise<WorkspaceSnapshot>;
  createAccount(input: CreateAccountInput): Promise<DesktopAccount>;
  createTasks(input: CreateTasksInput): Promise<DesktopTask[]>;
  cancelTask(taskId: string): Promise<void>;
  importVideos(): Promise<ImportReport>;
  updateAsset(assetId: string, input: { title: string; tag: string }): Promise<DesktopAsset>;
  openAccount(accountId: string): Promise<LoginObservation>;
  closeAccount(accountId: string): Promise<void>;
  getConnection(accountId: string): Promise<LoginObservation>;
  inspectAccount(accountId: string): Promise<import('./site-check-contracts.js').AccountSiteCheck>;
  reviewPublish(input:{taskIds:string[]}):Promise<import('./publishing-contracts.js').PublishReview>;
  startPublish(input:{reviewId:string}):Promise<import('./publishing-contracts.js').PublishBatch>;
  pausePublishing(batchId:string):Promise<import('./publishing-contracts.js').PublishBatch>;
  getPublishingBatch(batchId:string):Promise<import('./publishing-contracts.js').PublishBatch>;
  getPublishingBatches():Promise<import('./publishing-contracts.js').PublishBatch[]>;
  getPublishTaskDetails(taskId:string):Promise<import('./publishing-contracts.js').PublishTaskDetails>;
  recheckPublish(taskId:string):Promise<import('./publishing-contracts.js').PublishTaskDetails>;
  openPublishPage(taskId:string):Promise<void>;
  recordPublishCheck(input:import('./publishing-contracts.js').ManualCheckInput):Promise<import('./publishing-contracts.js').PublishTaskDetails>;
  updatePublishDraft(input:import('./publishing-contracts.js').PublishDraftInput):Promise<DesktopTask>;
  createRepostDraft(input:import('./publishing-contracts.js').RepostDraftInput):Promise<DesktopTask>;
}
declare global { interface Window { xumu?: DesktopApi } }
