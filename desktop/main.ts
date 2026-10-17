import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

if (!app.isPackaged && process.env.XUMU_DATA_DIR) { mkdirSync(process.env.XUMU_DATA_DIR, { recursive: true }); app.setPath('userData', process.env.XUMU_DATA_DIR); }
export function createDesktopWindow(): BrowserWindow {
  const win = new BrowserWindow({ width: 1440, height: 1000, minWidth: 960, minHeight: 700, title: '序幕 · 创作者工作台', backgroundColor: '#f7f8fa', autoHideMenuBar: true, webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  void win.loadFile(join(__dirname, '../renderer/desktop.html'));
  return win;
}
app.whenReady().then(() => {
  ipcMain.handle('xumu:runtime', event => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error('不允许的调用来源');
    return { mode: 'desktop', version: app.getVersion() };
  });
  createDesktopWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createDesktopWindow(); });
}).catch(error => { dialog.showErrorBox('序幕启动失败', String(error.message || error)); app.exit(1); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
