export type SitePageCheck = {
  site: 'creator' | 'douyin' | 'other';
  route: string | null;
  state: 'read' | 'not_inspected' | 'unavailable';
  controls?: { fileInputs: number; editors: number; publish: number; reply: number; login: number };
  apiRoutes?: string[];
};
export type AccountSiteCheck = {
  schemaVersion: 1;
  checkedAt: string;
  identity: 'not_connected';
  publishing: 'not_connected';
  comments: 'not_connected';
  pages: SitePageCheck[];
};
