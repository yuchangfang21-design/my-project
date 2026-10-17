import { BrowserWindow, ipcMain, dialog, type IpcMainInvokeEvent } from 'electron';
import type { Repository } from './storage/repository.js';
import type { MediaLibrary } from './media/library.js';
export function registerIpc(window: BrowserWindow, repository: Repository, media: MediaLibrary): void {
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
  handle('xumu:update-asset', (assetId, input) => repository.updateAsset(assetId,input));
  handle('xumu:import-videos', async () => {
    const result=await dialog.showOpenDialog(window,{title:'导入本地视频',properties:['openFile','multiSelections'],filters:[{name:'视频文件',extensions:['mp4','mov']}]});
    return result.canceled ? {added:0,duplicates:0,failures:[]} : media.importFiles(result.filePaths);
  });
}
