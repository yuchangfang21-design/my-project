export type LoginStatus = 'not_logged_in' | 'opening' | 'pending_confirmation' | 'logged_in' | 'expired';
export type Identity = { remoteId: string; displayName: string; observedAt: string };
export type LoginObservation = { accountId: string; status: LoginStatus; identity?: Identity; reason?: string };
export type CreateAccountInput = { name: string; handle?: string; group: string };
export type CreateTasksInput = { assetId: string; accountIds: string[]; title: string };
export type ImportReport = { added: number; duplicates: number; failures: { filename: string; reason: string }[] };
export interface DesktopAccount { id: string; name: string; handle: string; group: string; color: string; initial: string; demo: false; followers: string; loginStatus: LoginStatus; identity?: Identity }
export interface DesktopAsset { id: string; title: string; filename: string; poster: string; tag: string; duration: string; size: string; imported: true; sha256: string }
export interface DesktopTask { id: string; accountId: string; assetId: string; title: string; status: 'pending' | 'cancelled'; time: string }
export interface WorkspaceSnapshot { version: 1; accounts: DesktopAccount[]; assets: DesktopAsset[]; tasks: DesktopTask[]; messages: [] }
export interface DesktopApi {
  getRuntime(): Promise<{ mode: 'desktop'; version: string }>;
  getSnapshot(): Promise<WorkspaceSnapshot>;
  createAccount(input: CreateAccountInput): Promise<DesktopAccount>;
  createTasks(input: CreateTasksInput): Promise<DesktopTask[]>;
  cancelTask(taskId: string): Promise<void>;
  importVideos(): Promise<ImportReport>;
  updateAsset(assetId: string, input: { title: string; tag: string }): Promise<DesktopAsset>;
}
declare global { interface Window { xumu?: DesktopApi } }
