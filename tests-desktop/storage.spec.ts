import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchDesktop } from './helpers';
test('database starts empty, persists accounts, and validates IPC commands', async () => {
  const dir = await mkdtemp(join(tmpdir(), '序幕 database '));
  try {
    let app = await launchDesktop(dir);
    try {
      const page = await app.firstWindow();
      expect(await page.evaluate(() => (window as any).xumu.getSnapshot())).toMatchObject({ accounts: [], assets: [], tasks: [], messages: [] });
      const results = await page.evaluate(async () => {
        const api = (window as any).xumu;
        const accounts = await Promise.all(['杭州店','上海店'].map(name => api.createAccount({ name, group: '门店账号' })));
        let rejected = 0;
        for (const input of [{ name: '', group: '门店账号' }, { name: 'a'.repeat(31), group: '门店账号' }, { name: 'test', group: 'a', loginStatus: 'logged_in' }]) {
          try { await api.createAccount(input); } catch { rejected++; }
        }
        try { await api.createTasks({ assetId: '../escape', accountIds: [accounts[0].id], title: 'bad' }); } catch { rejected++; }
        return { snapshot: await api.getSnapshot(), rejected, keys: Object.keys(api) };
      });
      expect(results.snapshot.accounts).toHaveLength(2);
      expect(results.snapshot.accounts.every((a: any) => a.demo === false && a.loginStatus === 'not_logged_in')).toBeTruthy();
      expect(results.rejected).toBe(4);
      expect(results.keys).not.toContain('invoke');
      expect(results.keys).not.toContain('saveWorkspace');
    } finally { await app.close(); }
    app = await launchDesktop(dir);
    try { const page = await app.firstWindow(); expect((await page.evaluate(() => (window as any).xumu.getSnapshot())).accounts.map((a: any) => a.name)).toEqual(['杭州店','上海店']); }
    finally { await app.close(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('database rejects future schema without changing the original database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xumu-migration-'));
  const app = await launchDesktop(dir);
  try {
    const result = await app.evaluate(async (_electron, root) => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const { join } = require('node:path'); const { mkdirSync, readFileSync } = require('node:fs'); const { createHash } = require('node:crypto');
      const Database = require('better-sqlite3');
      const { Repository } = require(join(process.cwd(), 'dist-desktop/desktop/storage/repository.js'));
      const target = join(root, 'future'); mkdirSync(target); const file = join(target, 'workspace.sqlite');
      const db = new Database(file); db.exec('CREATE TABLE retained(value TEXT); INSERT INTO retained VALUES (\'keep\'); PRAGMA user_version=99;'); db.close();
      const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex'); const before = hash(); let rejected = false;
      try { const repo = new Repository(target); repo.initialize(); repo.close(); } catch { rejected = true; }
      return { rejected, preserved: before === hash() };
    }, dir);
    expect(result).toEqual({ rejected: true, preserved: true });
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
