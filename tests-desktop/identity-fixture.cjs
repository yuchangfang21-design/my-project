const path = require('node:path');
const { chromium } = require('playwright-core');
const { Repository } = require('../dist-desktop/desktop/storage/repository.js');
const { SessionManager } = require('../dist-desktop/desktop/browser/session-manager.js');
const endpoint = '/account/api/v1/user/account/info';

async function createIdentityFixture(root, options = {}) {
  const observedPath = endpoint + (options.trailingSlash ? '/' : '');
  const repo = new Repository(path.join(root, 'db')); repo.initialize();
  const accounts = [repo.createAccount({ name: '本地夹具一', group: '测试' }), repo.createAccount({ name: '本地夹具二', group: '测试' })];
  const responses = new Map(accounts.map(a => [a.id, { body: '{"message":"success","data":{"user_id":9007199254740993,"screen_name":"夹具身份","mobile":"PRIVATE_PHONE","session_key":"PRIVATE_SESSION"}}', status: 200, contentType: 'application/json' }]));
  const contexts = new Map(); const requests = []; const foreignRequests = [];
  const manager = new SessionManager(path.join(root, 'profiles'), repo, { launch: async profile => {
    const accountId = path.basename(profile);
    const context = await chromium.launchPersistentContext(profile, { headless: true, executablePath: process.platform === 'linux' ? '/usr/bin/chromium' : undefined, channel: process.platform === 'win32' ? 'msedge' : undefined, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
    contexts.set(accountId, context);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'creator.douyin.com') foreignRequests.push(url.origin);
      if (url.pathname === observedPath && url.hostname === 'creator.douyin.com') {
        requests.push({ accountId, method: route.request().method(), path: url.pathname, queryPreserved: url.searchParams.get('aid') === '2906' });
        const response = responses.get(accountId);
        if (response.stall) return;
        return route.fulfill(response);
      }
      if (url.pathname === '/' && url.hostname === 'creator.douyin.com') return route.fulfill({ status: 302, headers: { location: '/creator-micro/home' } });
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<h1>本地夹具</h1><script>fetch('${observedPath}?aid=2906&fixture=PRIVATE_QUERY').then(r=>r.text()).finally(()=>window.fixtureLoaded=true)</script>` });
    });
    return context;
  } });
  async function open(index) {
    await manager.open(accounts[index].id);
    await manager.withAccountPage(accounts[index].id, async page => {
      await page.waitForFunction(() => window.fixtureLoaded === true);
      await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname.replace(/\/$/, '') === '/account/api/v1/user/account/info'));
    });
  }
  return { repo, accounts, responses, contexts, requests, foreignRequests, manager, open, close: async () => { await manager.closeAll(); repo.close(); } };
}
module.exports = { createIdentityFixture };
