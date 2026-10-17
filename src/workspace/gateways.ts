import { loadWorkspace, STORAGE_KEY, type Workspace } from '../data';
import type { DesktopApi } from '../../shared/desktop-contracts';
export const emptyWorkspace = (): Workspace => ({version:1,accounts:[],assets:[],tasks:[],messages:[]});
export type WorkspaceGateway = { kind:'demo'; load:typeof loadWorkspace; save:(workspace:Workspace)=>void } | { kind:'desktop'; api:DesktopApi; load:()=>Promise<Workspace> };
export const demoGateway:WorkspaceGateway={kind:'demo',load:loadWorkspace,save:workspace=>localStorage.setItem(STORAGE_KEY,JSON.stringify(workspace))};
export const desktopGateway=(api:DesktopApi):WorkspaceGateway=>({kind:'desktop',api,load:()=>api.getSnapshot()});
