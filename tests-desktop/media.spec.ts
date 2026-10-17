import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchDesktop } from './helpers';
test('media imports Unicode paths, rejects unsafe files, deduplicates and survives source removal', async () => {
  const dir = await mkdtemp(join(tmpdir(), '序幕 media ')); const app = await launchDesktop(dir);
  try {
    const result = await app.evaluate(async (_electron, root) => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const fs = require('node:fs'); const p = require('node:path'); const crypto = require('node:crypto');
      const { Repository } = require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js'));
      const { MediaLibrary } = require(p.join(process.cwd(),'dist-desktop/desktop/media/library.js'));
      const dataDir=p.join(root,'media-db'); const repo=new Repository(dataDir); repo.initialize();
      const media=new MediaLibrary(dataDir,repo); const source=p.join(root,'拿铁 最终版.mp4');
      const data=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'); fs.writeFileSync(source,data);
      const copy=p.join(root,'相同内容.mov'); fs.writeFileSync(copy,data);
      const bad=p.join(root,'fake.mp4'); fs.writeFileSync(bad,'not a video'); const empty=p.join(root,'empty.mp4'); fs.writeFileSync(empty,'');
      const link=p.join(root,'alias.mp4'); if(process.platform!=='win32')fs.symlinkSync(source,link);
      const first=await media.importFiles([source,copy,bad,empty,...(process.platform==='win32'?[]:[link]),p.join(root,'missing.mp4')]);
      fs.unlinkSync(source); const snapshot=repo.snapshot(); const asset=snapshot.assets[0];
      const account=repo.createAccount({name:'真实账号',group:'门店'});
      const tasks=repo.createTasks({assetId:asset.id,accountIds:[account.id],title:'任务快照标题'}); repo.updateAsset(asset.id,{title:'素材新标题',tag:'门店日常'});
      let duplicate=false;try{repo.createTasks({assetId:asset.id,accountIds:[account.id],title:'重复'});}catch{duplicate=true;}
      const files=fs.readdirSync(p.join(dataDir,'media')).filter((f:string)=>!f.startsWith('.'));
      const file=p.join(dataDir,'media',files[0]); const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      const noTemp=fs.readdirSync(p.join(dataDir,'media')).every((f:string)=>!f.endsWith('.tmp'));
      const taskTitle=repo.snapshot().tasks[0].title; repo.cancelTask(tasks[0].id);repo.close();
      const reopen=new Repository(dataDir);reopen.initialize();const persisted=reopen.snapshot();reopen.close();
      return{first,count:snapshot.assets.length,hashMatches:hash===asset.sha256,noTemp,taskTitle,duplicate,status:persisted.tasks[0].status,expectedFailures:process.platform==='win32'?3:4};
    }, dir);
    expect(result.first.added).toBe(1);expect(result.first.duplicates).toBe(1);expect(result.first.failures).toHaveLength(result.expectedFailures);
    expect(result).toMatchObject({count:1,hashMatches:true,noTemp:true,taskTitle:'任务快照标题',duplicate:true,status:'cancelled'});
  } finally { await app.close();await rm(dir,{recursive:true,force:true}); }
});
