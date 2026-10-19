import { CommentsService } from './comments/service.js';
import { UnverifiedCommentsAdapter } from './comments/adapter.js';
import { CommentDraftCloseGuard } from './comments/draft-close.js';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join, isAbsolute } from 'node:path';
import { mkdirSync } from 'node:fs';
import { Repository } from './storage/repository.js';
import { registerIpc } from './ipc.js';
import { MediaLibrary } from './media/library.js';
import { SessionManager } from './browser/session-manager.js';
import { PublishingService } from './publishing/service.js';
import { OperationCoordinator } from './publishing/coordinator.js';
import { DouyinPrivatePublishAdapter } from './publishing/adapter.js';
let repository: Repository;
let sessions: SessionManager;
let media: MediaLibrary;
let publishing:PublishingService;
let coordinator:OperationCoordinator;
let comments:CommentsService;
let guard:CommentDraftCloseGuard|undefined;
let requestingQuit=false;
let quitting = false;
let quitReady=false;

const dataOverride=app.commandLine.getSwitchValue('user-data-dir') || (!app.isPackaged?process.env.XUMU_DATA_DIR:undefined);
if(dataOverride){if(!isAbsolute(dataOverride))throw new Error('数据目录必须是绝对路径');mkdirSync(dataOverride,{recursive:true});app.setPath('userData',dataOverride);}
export function createDesktopWindow(): BrowserWindow {
  const win = new BrowserWindow({ width: 1440, height: 1000, minWidth: 960, minHeight: 700, title: '序幕 · 创作者工作台', backgroundColor: '#f7f8fa', autoHideMenuBar: true, webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  void win.loadFile(join(__dirname, '../renderer/desktop.html'));
  return win;
}
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', () => { const win = BrowserWindow.getAllWindows()[0]; if (win?.isMinimized()) win.restore(); win?.focus(); });
if (primaryInstance) app.whenReady().then(async () => {
  repository = new Repository(app.getPath('userData')); repository.initialize();
  media = new MediaLibrary(app.getPath('userData'),repository); await media.initialize();
  if (quitting) return;
  sessions = new SessionManager(join(app.getPath('userData'),'profiles'),repository);
  coordinator=new OperationCoordinator();
  publishing=new PublishingService(repository.publishing,repository,media,sessions,coordinator,new DouyinPrivatePublishAdapter());
  ipcMain.handle('xumu:runtime', event => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error('不允许的调用来源');
    return { mode: 'desktop', version: app.getVersion() };
  });
  comments=new CommentsService(repository.comments,repository,sessions,coordinator,new UnverifiedCommentsAdapter());
  const connectWindow=()=>{const win=createDesktopWindow();guard=new CommentDraftCloseGuard(win);registerIpc(win,repository,media,sessions,publishing,coordinator,comments,guard);};
  connectWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) connectWindow(); });
}).catch(error => { if (!quitting) { dialog.showErrorBox('序幕启动失败', String(error.message || error)); app.exit(1); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit',event=>{
  if(quitReady)return;event.preventDefault();if(quitting||requestingQuit)return;requestingQuit=true;
  void (async()=>{
    if(guard&&!await guard.request()){requestingQuit=false;return;}
    quitting=true;
    await Promise.allSettled([publishing?.close(),comments?.close()]);
    for(const cleanup of[()=>coordinator?.close(),()=>sessions?.closeAll(),()=>media?.close()])await Promise.resolve().then(cleanup).catch(()=>undefined);
    repository?.close();quitReady=true;app.quit();
  })();
});
