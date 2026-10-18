import { test, expect } from '@playwright/test';
import { mkdtemp, rm, readdir, unlink, writeFile } from 'node:fs/promises';
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
      const target=p.join(root,'original','nested');fs.mkdirSync(target,{recursive:true});fs.writeFileSync(p.join(target,'video.mp4'),data);
      const linked=p.join(root,'directory-alias');fs.symlinkSync(p.join(root,'original'),linked,process.platform==='win32'?'junction':'dir');
      const first=await media.importFiles([source,copy,...(process.platform==='win32'?[copy.toUpperCase()]:[]),bad,empty,...(process.platform==='win32'?[]:[link]),p.join(linked,'nested','video.mp4'),p.join(root,'missing.mp4')]);
      if(first.added!==1){const{inspectFixtureFile}=require(p.join(process.cwd(),'tests-desktop/media-diagnostics.cjs'));throw new Error('Fixture media import failed: '+JSON.stringify(first)+'; fixture file evidence: '+JSON.stringify(await inspectFixtureFile(source)));}
      fs.unlinkSync(source); const snapshot=repo.snapshot(); const asset=snapshot.assets[0];
      const account=repo.createAccount({name:'真实账号',group:'门店'});
      const tasks=repo.createTasks({assetId:asset.id,accountIds:[account.id],title:'任务快照标题'}); repo.updateAsset(asset.id,{title:'素材新标题',tag:'门店日常'});
      let duplicate=false;try{repo.createTasks({assetId:asset.id,accountIds:[account.id],title:'重复'});}catch{duplicate=true;}
      const files=fs.readdirSync(p.join(dataDir,'media')).filter((f:string)=>!f.startsWith('.'));
      const file=p.join(dataDir,'media',files[0]); const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      const noTemp=fs.readdirSync(p.join(dataDir,'media')).every((f:string)=>!f.endsWith('.tmp'));
      const taskTitle=repo.snapshot().tasks[0].title; repo.cancelTask(tasks[0].id);repo.close();
      const reopen=new Repository(dataDir);reopen.initialize();const persisted=reopen.snapshot();reopen.close();
      return{first,count:snapshot.assets.length,hashMatches:hash===asset.sha256,noTemp,taskTitle,duplicate,status:persisted.tasks[0].status,expectedFailures:process.platform==='win32'?4:5,expectedDuplicates:process.platform==='win32'?2:1};
    }, dir);
    expect(result.first.added).toBe(1);expect(result.first.duplicates).toBe(result.expectedDuplicates);expect(result.first.failures).toHaveLength(result.expectedFailures);
    expect(result.first.failures.map(f=>f.filename)).toEqual(['fake.mp4','empty.mp4',...(process.platform==='win32'?[]:['alias.mp4']),'video.mp4','missing.mp4']);
    expect(result.first.failures.find(f=>f.filename==='video.mp4')?.reason).toBe('不允许符号链接或非普通文件');
    expect(result).toMatchObject({count:1,hashMatches:true,noTemp:true,taskTitle:'任务快照标题',duplicate:true,status:'cancelled'});
  } finally { await app.close();await rm(dir,{recursive:true,force:true}); }
});

test('missing and corrupt managed videos are blocked and can be repaired without losing metadata or tasks', async () => {
  const dir=await mkdtemp(join(tmpdir(),'xumu-recovery-'));const source=join(dir,'恢复视频.mp4');
  await writeFile(source,Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'));
  let app=await launchDesktop(dir);
  try {
    let page=await app.firstWindow();
    await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},source);
    await page.evaluate(async()=>{await window.xumu!.createAccount({name:'恢复账号',group:'门店'});const report=await window.xumu!.importVideos();if(report.added!==1)throw new Error('Fixture media import failed: '+JSON.stringify(report));const state=await window.xumu!.getSnapshot();await window.xumu!.updateAsset(state.assets[0].id,{title:'保留的编辑标题',tag:'门店日常'});await window.xumu!.createTasks({assetId:state.assets[0].id,accountIds:[state.accounts[0].id],title:'原任务'});});
    for(const damage of ['missing','corrupt']) {
      const before=await page.evaluate(()=>window.xumu!.getSnapshot());await app.close();
      const mediaDir=join(dir,'media');const file=join(mediaDir,(await readdir(mediaDir)).find(f=>!f.startsWith('.'))!);
      if(damage==='missing')await unlink(file);else await writeFile(file,'corrupted managed video');
      app=await launchDesktop(dir);page=await app.firstWindow();
      const state=await page.evaluate(()=>window.xumu!.getSnapshot());
      expect(state.assets[0].availability).toBe(damage);
      const blocked=await page.evaluate(async()=>{const s=await window.xumu!.getSnapshot();try{await window.xumu!.createTasks({assetId:s.assets[0].id,accountIds:[s.accounts[0].id],title:'不可用'});return false;}catch(error){return String(error).includes('重新导入');}});expect(blocked).toBe(true);
      await page.getByRole('navigation').getByRole('button',{name:'素材库'}).click();await expect(page.getByText(damage==='missing'?'文件缺失，请重新导入':'文件损坏，请重新导入')).toBeVisible();
      await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},source);
      const report=await page.evaluate(()=>window.xumu!.importVideos());expect(report).toMatchObject({added:0,repaired:1,duplicates:0,failures:[]});
      const restored=await page.evaluate(()=>window.xumu!.getSnapshot());expect(restored.assets).toHaveLength(1);expect(restored.assets[0]).toMatchObject({id:before.assets[0].id,title:'保留的编辑标题',tag:'门店日常',availability:'ready'});expect(restored.tasks).toEqual(before.tasks);
    }
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('normal quit cancels active imports and startup removes abandoned application temporary files',async()=>{
  test.setTimeout(60_000);const dir=await mkdtemp(join(tmpdir(),'xumu-quit-import-'));let app=await launchDesktop(dir);
  try{
    const source=join(dir,'大视频.mp4');await app.evaluate(({dialog},path)=>{const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json');const fs=require('node:fs');fs.writeFileSync(path,Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'));fs.truncateSync(path,1024*1024*1024);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},source);
    const page=await app.firstWindow();await page.evaluate(()=>{void window.xumu!.importVideos().catch(()=>undefined);});
    const mediaDir=join(dir,'media');await expect.poll(async()=>(await readdir(mediaDir).catch(()=>[])).some(f=>f.endsWith('.tmp'))).toBe(true);
    await app.close();expect((await readdir(mediaDir)).filter(f=>f.endsWith('.tmp'))).toEqual([]);
    const abandoned='.00000000-0000-4000-8000-000000000001.tmp';await writeFile(join(mediaDir,abandoned),'interrupted');await writeFile(join(mediaDir,'user-notes.tmp'),'keep');
    app=await launchDesktop(dir);await app.firstWindow();expect(await readdir(mediaDir)).not.toContain(abandoned);expect(await readdir(mediaDir)).toContain('user-notes.tmp');
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
