import type { BrowserContext } from 'playwright-core';
import type { AccountSiteCheck, SitePageCheck } from '../../shared/site-check-contracts.js';

// These are public route words, not identity selectors. Unknown path segments,
// URL queries, fragments and all page text are intentionally excluded.
const routeWords = new Set(['creator-micro', 'home', 'content', 'upload', 'publish', 'post', 'video', 'manage', 'comment', 'comments', 'message', 'messages', 'interaction', 'web', 'api', 'media', 'user', 'info', 'profile', 'account', 'aweme', 'v1', 'v2']);
function location(raw: string): Pick<SitePageCheck, 'site' | 'route'> {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return { site: 'other', route: null };
    const site = url.hostname === 'creator.douyin.com' ? 'creator' : url.hostname === 'www.douyin.com' ? 'douyin' : 'other';
    return { site, route: site === 'other' ? null : '/' + url.pathname.slice(0, 400).split('/').filter(Boolean).slice(0, 12).map(word => routeWords.has(word) ? word : '[segment]').join('/') };
  } catch { return { site: 'other', route: null }; }
}

export async function inspectOfficialPages(context: BrowserContext): Promise<AccountSiteCheck> {
  const pages: SitePageCheck[] = [];
  for (const page of context.pages().slice(0, 5)) {
    const initialUrl = page.url();
    const address = location(initialUrl);
    if (address.site === 'other') { pages.push({ ...address, state: 'not_inspected' }); continue; }
    try {
      // No screenshots, storage access, requests, navigation, clicks or form writes.
      const evaluation = page.evaluate(expectedUrl => {
        // The document may have changed since the main process read page.url().
        // Reject it before accessing any DOM or performance entries.
        if (window.location.href !== expectedUrl) return null;
        const buttons = Array.from(document.querySelectorAll('button,[role="button"]')).slice(0, 1000);
        const count = (labels: string[]) => buttons.filter(button => labels.includes(button.textContent?.trim() || '')).length;
        return {
          url: window.location.href,
          controls: {
            fileInputs: document.querySelectorAll('input[type="file"]').length,
            editors: document.querySelectorAll('[contenteditable="true"]').length,
            publish: count(['发布']), reply: count(['回复']), login: count(['登录', '扫码登录', '手机号登录']),
          },
          resources: performance.getEntriesByType('resource').filter(entry => ['fetch', 'xmlhttprequest'].includes((entry as PerformanceResourceTiming).initiatorType)).slice(-100).map(entry => entry.name),
        };
      }, initialUrl);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('页面检查超时')), 1500); });
      const observed = await Promise.race([evaluation, deadline]).finally(() => clearTimeout(timer));
      // A navigation during observation invalidates the whole observation.
      if (!observed || observed.url !== initialUrl || page.url() !== initialUrl) { pages.push({ ...address, state: 'unavailable' }); continue; }
      const apiRoutes = [...new Set(observed.resources.flatMap(raw => {
        const resource = location(raw);
        return resource.site === address.site && resource.route?.includes('/api/') ? [resource.route] : [];
      }))].slice(0, 20);
      pages.push({ ...address, state: 'read', controls: observed.controls, apiRoutes });
    } catch { pages.push({ ...address, state: 'unavailable' }); }
  }
  return { schemaVersion: 1, checkedAt: new Date().toISOString(), identity: 'not_connected', publishing: 'not_connected', comments: 'not_connected', pages };
}
