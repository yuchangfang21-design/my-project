import { test, expect } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchDesktop } from './helpers';
test('workspace uses real empty state and persists UI account, media and task actions', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'序幕 workspace '));const file=join(dir,'真实视频.mp4');await writeFile(file,Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'));
  let app=await launchDesktop(dir);
  try{
    let page=await app.firstWindow();await expect(page.getByRole('heading',{name:'让创作，井井有条。'})).toBeVisible();
    await expect(page.getByText('内容数据尚未接入',{exact:true})).toBeVisible();await expect(page.getByText('山野咖啡',{exact:true})).toHaveCount(0);
    await page.getByRole('navigation').getByRole('button',{name:'账号管理'}).click();await page.getByRole('button',{name:'添加账号',exact:true}).click();await page.getByLabel('账号名称').fill('我的杭州店');await page.getByRole('button',{name:'添加账号档案'}).click();await expect(page.getByRole('heading',{name:'我的杭州店'})).toBeVisible();
    await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},file);
    await page.getByRole('navigation').getByRole('button',{name:'素材库'}).click();await page.locator('.page-heading').getByRole('button',{name:'导入视频',exact:true}).click();await expect(page.getByRole('heading',{name:'真实视频',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'为真实视频创建任务'}).click();await page.getByRole('dialog').getByRole('checkbox',{name:'我的杭州店'}).check();await page.getByRole('button',{name:'加入发布队列（1）'}).click();await expect(page.getByRole('row').filter({hasText:'真实视频'})).toBeVisible();await expect(page.getByRole('button',{name:'演示运行',exact:true})).toHaveCount(0);
    await app.close();app=await launchDesktop(dir);page=await app.firstWindow();await page.getByRole('navigation').getByRole('button',{name:'发布任务'}).click();await expect(page.getByRole('row').filter({hasText:'真实视频'})).toBeVisible();await page.getByRole('button',{name:'查看任务：真实视频'}).click();await page.getByRole('button',{name:'取消此任务'}).click();await expect(page.getByRole('row').filter({hasText:'真实视频'}).getByText('已取消',{exact:true})).toBeVisible();
    await page.getByRole('navigation').getByRole('button',{name:'消息中心'}).click();await expect(page.getByText('评论读取待验证',{exact:true})).toBeVisible();await expect(page.getByText('评论回复待验证',{exact:true})).toBeVisible();await expect(page.getByText('私信尚未接通 · 阶段 C',{exact:true})).toBeVisible();await expect(page.getByTestId('comment-row')).toHaveCount(0);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
