export type SitePageCheck = {
  site: 'creator' | 'douyin' | 'other';
  route: string | null;
  state: 'read' | 'not_inspected' | 'unavailable';
  controls?: { fileInputs: number; editors: number; publish: number; reply: number; login: number };
  apiRoutes?: string[];
};
export type AccountSiteCheck = {
  schemaVersion: 2;
  checkedAt: string;
  identity: 'not_observed' | 'observed';
  identityRead?: IdentityReadSummary;
  publishing: 'not_connected';
  comments: 'not_connected';
  pages: SitePageCheck[];
};
export type IdentityReadSummary = {
  checkedAt?: string;
  status: 'not_checked' | 'verified' | 'endpoint_unseen' | 'unsupported_response' | 'not_authenticated' | 'unavailable' | 'page_changed' | 'identity_mismatch' | 'duplicate_identity';
  fields?: { root: Record<string, string>; data: Record<string, string>; account_info?: Record<string, string> };
};
