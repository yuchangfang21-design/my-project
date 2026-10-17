import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('root HTML renders and responds inside an isolated preview without a source server', async ({ page }) => {
  const html = await readFile(resolve('index.html'), 'utf8');
  const blocked: string[] = [];
  await page.route('**/*', async route => { blocked.push(route.request().url()); await route.abort(); });
  await page.setContent('<iframe title="效果预览" sandbox="allow-scripts" style="width:1400px;height:1000px;border:0"></iframe>');
  await page.locator('iframe').evaluate((frame, content) => { (frame as HTMLIFrameElement).srcdoc = content; }, html);
  const preview = page.frameLocator('iframe');
  await expect(preview.getByRole('heading', { name: '让创作，井井有条。' })).toBeVisible();
  await preview.getByRole('button', { name: '近 30 天' }).click();
  await expect(preview.getByText('486,250', { exact: true })).toBeVisible();
  await preview.getByRole('navigation').getByRole('button', { name: '消息中心' }).click();
  await preview.getByRole('textbox', { name: '回复草稿' }).fill('预览内可以输入草稿');
  await preview.getByRole('button', { name: '保存草稿' }).click();
  await expect(preview.getByRole('textbox', { name: '回复草稿' })).toHaveValue('预览内可以输入草稿');
  expect(blocked).toEqual([]);
});

test('root HTML shows the actual screenshot when preview scripts are unavailable', async ({ browser }) => {
  const html = await readFile(resolve('index.html'), 'utf8');
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('http://127.0.0.1:5173/static-preview.html');
    const screenshot = page.getByRole('img', { name: '序幕工作台静态效果图' });
    await expect(screenshot).toBeVisible();
    await expect(screenshot).toHaveJSProperty('naturalWidth', 1440);
    await expect(page.getByText('下方为实际效果图', { exact: false })).toBeVisible();
  } finally {
    await context.close();
  }
});
