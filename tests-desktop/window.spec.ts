import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchDesktop } from './helpers';
test('desktop window uses isolated preload and restarts without a source server', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xumu-window-'));
  try {
    for (let i = 0; i < 2; i++) {
      const app = await launchDesktop(dir);
      try {
        const page = await app.firstWindow();
        await expect(page.getByRole('heading', { name: /序幕|让创作/ })).toBeVisible();
        expect(await page.evaluate(() => typeof (window as any).require)).toBe('undefined');
        expect(await page.evaluate(() => (window as any).xumu.getRuntime())).toMatchObject({ mode: 'desktop' });
        expect(await app.evaluate(({ BrowserWindow }) => { const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox }; })).toEqual({ contextIsolation: true, nodeIntegration: false, sandbox: true });
      } finally { await app.close(); }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
