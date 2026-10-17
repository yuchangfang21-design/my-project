import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/desktop-contracts.js';
const api: DesktopApi = {
  getRuntime: () => ipcRenderer.invoke('xumu:runtime'),
  getSnapshot: () => ipcRenderer.invoke('xumu:snapshot'),
  createAccount: input => ipcRenderer.invoke('xumu:create-account', input),
  createTasks: input => ipcRenderer.invoke('xumu:create-tasks', input),
  cancelTask: taskId => ipcRenderer.invoke('xumu:cancel-task', taskId),
  importVideos: () => ipcRenderer.invoke('xumu:import-videos'),
  updateAsset: (assetId, input) => ipcRenderer.invoke('xumu:update-asset', assetId, input),
  openAccount: accountId => ipcRenderer.invoke('xumu:open-account', accountId),
  closeAccount: accountId => ipcRenderer.invoke('xumu:close-account', accountId),
  getConnection: accountId => ipcRenderer.invoke('xumu:connection', accountId),
};
contextBridge.exposeInMainWorld('xumu', api);
