import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/desktop-contracts.js';
const api: DesktopApi = { getRuntime: () => ipcRenderer.invoke('xumu:runtime') };
contextBridge.exposeInMainWorld('xumu', api);
