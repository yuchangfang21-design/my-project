import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchDesktop } from './helpers';

// Removing origin validation or including page text/URL parameters must fail these checks.
test('site check reports official page structure without credentials, personal text or remote writes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xumu-site-check-'));
  const app = await launchDesktop(dir);
  try {
    const result = await app.evaluate(async (_electron, root) => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const p = require('node:path');
      const { Repository } = require(p.join(process.cwd(), 'dist-desktop/desktop/storage/repository.js'));
      const { SessionManager } = require(p.join(process.cwd(), 'dist-desktop/desktop/browser/session-manager.js'));
      const { chromium } = require('playwright-core');
      const repo = new Repository(p.join(root, 'db')); repo.initialize();
      const first = repo.createAccount({ name: '不应导出的账号名称', group: '本地夹具' });
      const second = repo.createAccount({ name: '另一个账号', group: '本地夹具' });
      let writes = 0;
      const manager = new SessionManager(p.join(root, 'profiles'), repo, {
        launch: async (profile: string) => {
          const context = await chromium.launchPersistentContext(profile, { headless: true, executablePath: process.platform === 'linux' ? '/usr/bin/chromium' : undefined, channel: process.platform === 'win32' ? 'msedge' : undefined, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
          await context.route('**/*', (route: any) => {
            if (route.request().method() !== 'GET') writes++;
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>PRIVATE_NICKNAME</h1><p>PRIVATE_COMMENT</p><input type="file" accept="video/*"><input value="PRIVATE_INPUT"><div contenteditable="true">PRIVATE_DRAFT</div><button onclick="window.didSubmit=true">发布</button><button>回复</button>' });
          });
          await context.addCookies([{ name: 'sessionid', value: 'PRIVATE_COOKIE', domain: 'creator.douyin.com', path: '/' }]);
          return context;
        },
      });
      try {
        await manager.open(first.id);
        if (typeof manager.inspect !== 'function') return { supported: false };
        await manager.withAccountPage(first.id, async (page: any) => {
          await page.goto('https://creator.douyin.com/creator-micro/home?token=PRIVATE_TOKEN');
          await page.evaluate(() => fetch('/web/api/user/PRIVATE_PATH?token=PRIVATE_TOKEN').then(response => response.text()).then(() => undefined));
          await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('/web/api/user/PRIVATE_PATH')));
        });
        const before = repo.getConnection(first.id);
        const report = await manager.inspect(first.id);
        const after = repo.getConnection(first.id);
        let unopenedRejected = false, invalidRejected = false;
        try { await manager.inspect(second.id); } catch { unopenedRejected = true; }
        try { await manager.inspect('../escape'); } catch { invalidRejected = true; }
        const unchanged = await manager.withAccountPage(first.id, async (page: any) => page.evaluate(() => ({ input: (document.querySelector('input:not([type=file])') as HTMLInputElement).value, submitted: !!(window as any).didSubmit })));
        await manager.withAccountPage(first.id, async (page: any) => page.goto('https://outside.invalid/user/PRIVATE_FOREIGN?token=PRIVATE_TOKEN'));
        const foreign = await manager.inspect(first.id);
        return { supported: true, report, foreign, writes, unopenedRejected, invalidRejected, unchanged, connectionUnchanged: JSON.stringify(before) === JSON.stringify(after) };
      } finally { await manager.closeAll(); repo.close(); }
    }, dir);
    expect(result.supported).toBe(true);
    expect(result).toMatchObject({ writes: 0, unopenedRejected: true, invalidRejected: true, connectionUnchanged: true, unchanged: { input: 'PRIVATE_INPUT', submitted: false } });
    expect(result.report).toMatchObject({ schemaVersion: 1, identity: 'not_connected', publishing: 'not_connected', comments: 'not_connected', pages: [{ site: 'creator', route: '/creator-micro/home', state: 'read', controls: { fileInputs: 1, editors: 1, publish: 1, reply: 1 }, apiRoutes: ['/web/api/user/[segment]'] }] });
    expect(result.foreign).toMatchObject({ pages: [{ site: 'other', route: null, state: 'not_inspected' }] });
    const exported = JSON.stringify([result.report, result.foreign]);
    for (const secret of ['PRIVATE_', '不应导出的账号名称', 'sessionid', 'token=', 'outside.invalid']) expect(exported).not.toContain(secret);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test('site check has an explicit desktop action and keeps unverified capabilities visible', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xumu-site-ui-'));
  const app = await launchDesktop(dir);
  try {
    const page = await app.firstWindow();
    await page.evaluate(() => window.xumu!.createAccount({ name: '检查账号', group: '未分组' }));
    await page.reload();
    await page.getByRole('navigation').getByRole('button', { name: '账号管理', exact: true }).click();
    await expect(page.getByRole('button', { name: '生成接入检查', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '生成接入检查', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '未打开账号登录窗口' })).toBeVisible();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('xumu:site-check');
      ipcMain.handle('xumu:site-check', () => ({ schemaVersion: 1, checkedAt: new Date().toISOString(), identity: 'not_connected', publishing: 'not_connected', comments: 'not_connected', pages: [{ site: 'creator', route: '/creator-micro/home', state: 'read', controls: { fileInputs: 0, editors: 0, publish: 0, reply: 0, login: 0 }, apiRoutes: [] }] }));
    });
    await page.getByRole('button', { name: '生成接入检查', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '官方页面接入检查' })).toBeVisible();
    await expect(dialog.getByLabel('接入检查报告')).toHaveValue(/"identity": "not_connected"/);
    await expect(dialog.getByText('报告不会确认登录，也不会启用发布或评论。', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '关闭检查', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: '生成接入检查', exact: true })).toBeFocused();
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
