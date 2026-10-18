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
  reviewPublish:input=>ipcRenderer.invoke('xumu:publish-review',input),
  startPublish:input=>ipcRenderer.invoke('xumu:publish-start',input),
  pausePublishing:batchId=>ipcRenderer.invoke('xumu:publish-pause',batchId),
  getPublishingBatch:batchId=>ipcRenderer.invoke('xumu:publish-batch',batchId),
  getPublishingBatches:()=>ipcRenderer.invoke('xumu:publish-batches'),
  getPublishTaskDetails:taskId=>ipcRenderer.invoke('xumu:publish-details',taskId),
  recheckPublish:taskId=>ipcRenderer.invoke('xumu:publish-recheck',taskId),
  openPublishPage:taskId=>ipcRenderer.invoke('xumu:publish-open-page',taskId),
  recordPublishCheck:input=>ipcRenderer.invoke('xumu:publish-manual-check',input),
  updatePublishDraft:input=>ipcRenderer.invoke('xumu:publish-update-draft',input),
  createRepostDraft:input=>ipcRenderer.invoke('xumu:publish-repost-draft',input),
};
contextBridge.exposeInMainWorld('xumu', api);
