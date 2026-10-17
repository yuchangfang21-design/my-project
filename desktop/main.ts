import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join, isAbsolute } from 'node:path';
import { mkdirSync } from 'node:fs';
import { Repository } from './storage/repository.js';
import { registerIpc } from './ipc.js';
import { MediaLibrary } from './media/library.js';
import { SessionManager } from './browser/session-manager.js';
let repository: Repository;
let sessions: SessionManager;
let media: MediaLibrary;
let quitting = false;

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
  ipcMain.handle('xumu:runtime', event => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error('不允许的调用来源');
    return { mode: 'desktop', version: app.getVersion() };
  });
  registerIpc(createDesktopWindow(), repository, media, sessions);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) registerIpc(createDesktopWindow(), repository, media, sessions); });
}).catch(error => { if (!quitting) { dialog.showErrorBox('序幕启动失败', String(error.message || error)); app.exit(1); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit',event=>{
  if(quitting)return;event.preventDefault();quitting=true;
  void Promise.allSettled([media?.close(),sessions?.closeAll()]).then(()=>{repository?.close();app.quit();});
});
