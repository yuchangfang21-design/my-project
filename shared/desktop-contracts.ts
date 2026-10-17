export type LoginStatus = 'not_logged_in' | 'opening' | 'pending_confirmation' | 'logged_in' | 'expired';
export type Identity = { remoteId: string; displayName: string; observedAt: string };
export type LoginObservation = { accountId: string; status: LoginStatus; identity?: Identity; reason?: string };
export type CreateAccountInput = { name: string; handle?: string; group: string };
export type CreateTasksInput = { assetId: string; accountIds: string[]; title: string };
export type ImportReport = { added: number; duplicates: number; failures: { filename: string; reason: string }[] };
export interface DesktopApi { getRuntime(): Promise<{ mode: 'desktop'; version: string }> }
declare global { interface Window { xumu?: DesktopApi } }
