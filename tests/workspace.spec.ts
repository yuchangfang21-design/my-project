import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

test('overview, navigation and live search use clearly labeled demo data', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '让创作，井井有条。' })).toBeVisible();
  await expect(page.locator('.content-topline')).toContainText('交互演示/未连接抖音');
  await page.getByRole('button', { name: '近 30 天' }).click();
  await expect(page.getByText('486,250', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '全局搜索' }).pressSequentially('巷子');
  await page.getByRole('button', { name: '巷子深处，藏着一家小店 视频素材' }).click();
  await expect(page.getByRole('heading', { name: '巷子深处，藏着一家小店' })).toBeVisible();
  await expect(page.locator('.asset-card')).toHaveCount(1);
  expect(await page.locator('img').evaluateAll(images => images.every(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0))).toBeTruthy();
  expect(errors).toEqual([]);
});

test('add account remains unconnected after reload and dialog focus stays contained', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: '账号管理' }).click();
  await page.getByRole('button', { name: '添加账号', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '关闭弹窗' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '添加账号档案' })).toBeFocused();
  await dialog.getByLabel('账号名称').pressSequentially('山野杭州店');
  await dialog.getByLabel('抖音号').fill('shanye.hangzhou');
  await dialog.getByRole('button', { name: '添加账号档案' }).click();
  const card = page.locator('.account-card').filter({ has: page.getByRole('heading', { name: '山野杭州店' }) });
  await expect(card.getByText('未连接', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: '账号管理' }).click();
  await expect(page.getByRole('heading', { name: '山野杭州店' })).toBeVisible();
  await page.locator('.account-card').filter({ has: page.getByRole('heading', { name: '山野杭州店' }) }).getByRole('button', { name: '扫码登录' }).click();
  await expect(page.getByRole('dialog')).toContainText('不会把账号标记为已连接');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('video import, title editing and task mapping persist and reject duplicate tasks', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入视频文件').setInputFiles({ name: '本地新品.mp4', mimeType: 'video/mp4', buffer: Buffer.from('local-demo-only') });
  await expect(page.getByRole('heading', { name: '本地新品', exact: true })).toBeVisible();
  await page.locator('.asset-card').filter({ has: page.getByRole('heading', { name: '本地新品', exact: true }) }).getByRole('button', { name: '查看素材信息' }).click();
  await page.getByRole('dialog').getByLabel('作品标题').fill('本地新品发布预览');
  await page.getByRole('button', { name: '保存素材信息' }).click();
  await page.getByRole('button', { name: '为本地新品发布预览创建任务' }).click();
  await page.getByRole('dialog').getByRole('checkbox', { name: '山野咖啡' }).check();
  await page.getByRole('button', { name: '加入发布队列（1）' }).click();
  await expect(page.getByRole('row').filter({ hasText: '本地新品发布预览' })).toHaveCount(1);
  await page.getByRole('button', { name: '新建发布任务', exact: true }).click();
  await page.getByRole('dialog').getByRole('checkbox', { name: '山野咖啡' }).check();
  await page.getByRole('button', { name: '加入发布队列（1）' }).click();
  await expect(page.getByRole('status')).toContainText('请勿重复创建');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: '发布任务' }).click();
  await expect(page.getByRole('row').filter({ hasText: '本地新品发布预览' })).toHaveCount(1);
});

test('queue simulation requires confirmation and never claims an actual remote publication', async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on('request', request => { if (/douyin\.com/.test(request.url())) remoteRequests.push(request.url()); });
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: '发布任务' }).click();
  await page.getByRole('button', { name: '演示运行', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('不会打开抖音、上传视频或发布作品');
  await page.getByRole('button', { name: '确认演示运行' }).click();
  await expect(page.getByText('演示运行中', { exact: true })).toBeVisible();
  await expect(page.locator('.badge.demo_done')).toHaveCount(5, { timeout: 15_000 });
  await expect(page.getByRole('status')).toContainText('没有向抖音上传或发布视频');
  expect(remoteRequests).toEqual([]);
});

test('message drafts and local processed status persist without sending anything', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: '消息中心' }).click();
  await page.getByRole('textbox', { name: '回复草稿' }).pressSequentially('周末九点营业，欢迎来坐坐！');
  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page.getByRole('status')).toContainText('未发送');
  await page.getByRole('button', { name: '标记已处理' }).click();
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: '消息中心' }).click();
  await expect(page.getByRole('textbox', { name: '回复草稿' })).toHaveValue('周末九点营业，欢迎来坐坐！');
  await expect(page.getByRole('button', { name: '撤销处理' })).toBeVisible();
  await expect(page.getByText('真实回复发送尚未接通')).toBeVisible();
});

test('interrupted runs recover as requiring review, and corrupted storage does not crash', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('xumu-workspace-v1')!);
    data.tasks[0].status = 'running';
    localStorage.setItem('xumu-workspace-v1', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: '发布任务' }).click();
  await expect(page.getByText('待核对', { exact: true }).last()).toBeVisible();
  await page.evaluate(() => localStorage.setItem('xumu-workspace-v1', '{broken-json'));
  await page.reload();
  await expect(page.getByRole('heading', { name: '让创作，井井有条。' })).toBeVisible();
});

test('mobile layout has no page overflow and navigation stays usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const name of ['工作概览', '账号管理', '素材库', '发布任务', '消息中心']) {
    await page.getByRole('navigation').getByRole('button', { name }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
});

test('standalone HTML works with only its document supplied and all network access disabled', async ({ page, context }) => {
  const html = await readFile(resolve('artifacts/序幕-交互演示.html'), 'utf8');
  const documentUrl = 'http://127.0.0.1:5173/standalone-demo.html';
  const externalRequests: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url()) && request.url() !== documentUrl) externalRequests.push(request.url()); });
  await page.route('**/*', async route => {
    if (route.request().url() === documentUrl && route.request().resourceType() === 'document') {
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    } else {
      await route.abort();
    }
  });
  await context.setOffline(true);
  await page.goto(documentUrl);
  await expect(page.getByRole('heading', { name: '让创作，井井有条。' })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: '素材库' }).click();
  await expect(page.locator('.asset-card')).toHaveCount(6);
  expect(await page.locator('img').evaluateAll(images => images.every(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0))).toBeTruthy();
  await page.getByRole('navigation').getByRole('button', { name: '账号管理' }).click();
  await page.getByRole('button', { name: '添加账号', exact: true }).click();
  await page.getByRole('dialog').getByLabel('账号名称').fill('离线体验账号');
  await page.getByRole('button', { name: '添加账号档案' }).click();
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: '账号管理' }).click();
  await expect(page.getByRole('heading', { name: '离线体验账号' })).toBeVisible();
  expect(externalRequests).toEqual([]);
});
