import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { Repository } from './storage/repository.js';
export function registerIpc(window: BrowserWindow, repository: Repository): void {
  const handle = (channel: string, action: (...args: any[]) => unknown) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: any[]) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许的调用来源');
      return action(...args);
    });
  };
  handle('xumu:snapshot', () => repository.snapshot());
  handle('xumu:create-account', input => repository.createAccount(input));
  handle('xumu:create-tasks', input => repository.createTasks(input));
  handle('xumu:cancel-task', taskId => repository.cancelTask(taskId));
}
