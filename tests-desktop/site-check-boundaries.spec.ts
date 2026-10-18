import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchDesktop } from './helpers';

test('site check guards the document before inspecting a tab that navigated to another origin', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xumu-site-race-'));
  const app = await launchDesktop(dir);
  try {
    const result = await app.evaluate(async () => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const { chromium } = require('playwright-core');
      const { inspectOfficialPages } = require(require('node:path').join(process.cwd(), 'dist-desktop/desktop/browser/site-check.js'));
      const browser = await chromium.launch({ headless: true, executablePath: process.platform === 'linux' ? '/usr/bin/chromium' : undefined, channel: process.platform === 'win32' ? 'msedge' : undefined, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
      const context = await browser.newContext(); const page = await context.newPage();
      try {
        await context.route('**/*', (route: any) => route.fulfill({ contentType: 'text/html', body: '<button>not inspected</button>' }));
        await page.goto('https://creator.douyin.com/creator-micro/home');
        const evaluate = page.evaluate.bind(page);
        // Only the scheduling boundary is intercepted; inspection runs against a real foreign document.
        page.evaluate = async (fn: any, arg: any) => {
          await page.goto('https://foreign.invalid/');
          await evaluate(() => {
            (window as any).inspectionReads = 0;
            const query = document.querySelectorAll.bind(document);
            document.querySelectorAll = ((selector: string) => { (window as any).inspectionReads++; return query(selector); }) as typeof document.querySelectorAll;
          });
          return evaluate(fn, arg);
        };
        const report = await inspectOfficialPages(context);
        return { report, reads: await evaluate(() => (window as any).inspectionReads) };
      } finally { await browser.close(); }
    });
    expect(result.reads).toBe(0);
    expect(result.report.pages).toMatchObject([{ state: 'unavailable' }]);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test('site check bounds a stalled evaluation and releases the coordinated operation queue', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xumu-site-timeout-'));
  const app = await launchDesktop(dir);
  try {
    const result = await app.evaluate(async () => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const p = require('node:path'); const { chromium } = require('playwright-core');
      const { inspectOfficialPages } = require(p.join(process.cwd(), 'dist-desktop/desktop/browser/site-check.js'));
      const { OperationCoordinator } = require(p.join(process.cwd(), 'dist-desktop/desktop/publishing/coordinator.js'));
      const browser = await chromium.launch({ headless: true, executablePath: process.platform === 'linux' ? '/usr/bin/chromium' : undefined, channel: process.platform === 'win32' ? 'msedge' : undefined, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
      const context = await browser.newContext(); const page = await context.newPage();
      const coordinator = new OperationCoordinator();
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      try {
        await page.route('**/*', (route: any) => route.fulfill({ contentType: 'text/html', body: '<p>fixture</p>' }));
        await page.goto('https://creator.douyin.com/creator-micro/home');
        const evaluate = page.evaluate.bind(page);
        page.evaluate = () => evaluate(() => new Promise(() => {}));
        const report = coordinator.run(() => inspectOfficialPages(context));
        const next = coordinator.run(async () => 'queue available');
        const completed = await Promise.race([Promise.all([report, next]), new Promise<null>(resolve => { watchdog = setTimeout(() => resolve(null), 3000); })]);
        return { completed };
      } finally { clearTimeout(watchdog); await browser.close(); await coordinator.close(); }
    });
    expect(result.completed).not.toBeNull();
    expect(result.completed?.[0].pages).toMatchObject([{ state: 'unavailable' }]);
    expect(result.completed?.[1]).toBe('queue available');
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
