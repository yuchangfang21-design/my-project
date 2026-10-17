import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/desktop-contracts.js';
const api: DesktopApi = {
  getRuntime: () => ipcRenderer.invoke('xumu:runtime'),
  getSnapshot: () => ipcRenderer.invoke('xumu:snapshot'),
  createAccount: input => ipcRenderer.invoke('xumu:create-account', input),
  createTasks: input => ipcRenderer.invoke('xumu:create-tasks', input),
  cancelTask: taskId => ipcRenderer.invoke('xumu:cancel-task', taskId),
};
contextBridge.exposeInMainWorld('xumu', api);
