import type { CommentsService } from './comments/service.js';
import type { CommentDraftCloseGuard } from './comments/draft-close.js';
import { BrowserWindow, ipcMain, dialog, type IpcMainInvokeEvent } from 'electron';
import type { Repository } from './storage/repository.js';
import type { MediaLibrary } from './media/library.js';
import type { SessionManager } from './browser/session-manager.js';
import type { PublishingService } from './publishing/service.js';
import type { OperationCoordinator } from './publishing/coordinator.js';
export function registerIpc(window: BrowserWindow, repository: Repository, media: MediaLibrary, sessions: SessionManager, publishing:PublishingService,coordinator:OperationCoordinator,comments:CommentsService,guard:CommentDraftCloseGuard): void {
  const handle = (channel: string, action: (...args: any[]) => unknown) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: any[]) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许的调用来源');
      return action(...args);
    });
  };
  handle('xumu:comments-workspace', input => comments.getCommentWorkspace(input));
  handle('xumu:comments-summary', () => comments.getCommentSummary());
  handle('xumu:comments-details', input => comments.getCommentDetails(input));
  handle('xumu:comments-save-draft', input => comments.saveCommentDraft(input));
  handle('xumu:comments-processed', input => comments.markCommentProcessed(input));
  handle('xumu:comments-sync', input => comments.syncComments(input));
  handle('xumu:comments-review', input => comments.reviewCommentReply(input));
  handle('xumu:comments-send', input => comments.sendCommentReply(input));
  handle('xumu:comments-recheck', input => comments.recheckCommentReply(input));
  handle('xumu:comments-manual-check', input => comments.recordCommentReplyCheck(input));
  handle('xumu:comments-open-page', input => comments.openCommentPage(input));
  handle('xumu:comment-draft-register',()=>guard.register());
  handle('xumu:comment-draft-complete',input=>guard.complete(input));
  handle('xumu:snapshot', () => repository.snapshot());
  handle('xumu:create-account', input => repository.createAccount(input));
  handle('xumu:create-tasks', async input => { await media.checkAsset(input?.assetId); return repository.createTasks(input); });
  handle('xumu:cancel-task', taskId => repository.cancelTask(taskId));
  handle('xumu:open-account', accountId => coordinator.run(()=>sessions.open(accountId)));
  handle('xumu:close-account', accountId => coordinator.run(()=>sessions.close(accountId)));
  handle('xumu:connection', accountId => coordinator.run(()=>sessions.refresh(accountId)));
  handle('xumu:site-check', accountId => coordinator.run(async()=>({...await sessions.inspect(accountId),publishing:publishing.publicationMode})));
  handle('xumu:publish-review',input=>publishing.reviewPublish(input));
  handle('xumu:publish-start',input=>publishing.startPublish(input));
  handle('xumu:publish-pause',batchId=>publishing.pausePublishing(batchId));
  handle('xumu:publish-batch',batchId=>publishing.getPublishingBatch(batchId));
  handle('xumu:publish-batches',()=>publishing.getPublishingBatches());
  handle('xumu:publish-details',taskId=>publishing.getPublishTaskDetails(taskId));
  handle('xumu:publish-recheck',taskId=>publishing.recheckPublish(taskId));
  handle('xumu:publish-open-page',taskId=>publishing.openPublishPage(taskId));
  handle('xumu:publish-manual-check',input=>publishing.recordPublishCheck(input));
  handle('xumu:publish-update-draft',input=>publishing.updatePublishDraft(input));
  handle('xumu:publish-repost-draft',input=>publishing.createRepostDraft(input));
  handle('xumu:update-asset', (assetId, input) => repository.updateAsset(assetId,input));
  handle('xumu:import-videos', async () => {
    const result=await dialog.showOpenDialog(window,{title:'导入本地视频',properties:['openFile','multiSelections'],filters:[{name:'视频文件',extensions:['mp4','mov']}]});
    return result.canceled ? {added:0,repaired:0,duplicates:0,failures:[]} : media.importFiles(result.filePaths);
  });
}
