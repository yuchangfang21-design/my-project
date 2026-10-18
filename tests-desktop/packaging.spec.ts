import { _electron, test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('packaged application resolves preload, renderer and native database without a source server',async()=>{
  const executable=resolve(process.platform==='win32'?'release/win-unpacked/xumu-workspace.exe':'release/linux-unpacked/xumu-workspace');
  expect(existsSync(executable),'packaged executable must exist before installation acceptance').toBeTruthy();
  const dataDir=await mkdtemp(join(tmpdir(),'序幕 packaged '));
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  try{
    for(let i=0;i<2;i++){
      const app=await _electron.launch({executablePath:executable,args:[...(process.platform==='linux'?['--no-sandbox']:[]),`--user-data-dir=${dataDir}`],env});
      try{const page=await app.firstWindow();await expect(page.getByRole('heading',{name:'让创作，井井有条。'})).toBeVisible();expect(await app.evaluate(({app})=>app.isPackaged)).toBe(true);const snapshot=await page.evaluate(()=>(window as any).xumu.getSnapshot());expect(snapshot.accounts).toHaveLength(i);if(i===0)await page.evaluate(()=>(window as any).xumu.createAccount({name:'打包持久化',group:'门店'}));expect(await app.evaluate(({app})=>app.getPath('userData'))).toBe(dataDir);}
      finally{await app.close();}
    }
  }finally{await rm(dataDir,{recursive:true,force:true});}
});

test('packaged application migrates legacy tasks and retains new draft revisions after restart', async () => {
  const executable = resolve(process.platform === 'win32' ? 'release/win-unpacked/xumu-workspace.exe' : 'release/linux-unpacked/xumu-workspace');
  expect(existsSync(executable), 'build the packaged executable before acceptance').toBeTruthy();
  const root = await mkdtemp(join(tmpdir(), '序幕 migration '));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = (folder: string) => _electron.launch({ executablePath: executable, args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), `--user-data-dir=${folder}`], env });
  let app = await launch(join(root, 'bootstrap'));
  try {
    await app.firstWindow();
    const legacyDir = join(root, '旧版工作区');
    const taskId = await app.evaluate(({ app }, folder) => {
      const require = process.getBuiltinModule('module')!.createRequire(app.getAppPath() + '/package.json');
      const Database = require('better-sqlite3'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
      fs.mkdirSync(path.join(folder, 'media'), { recursive: true });
      const db = new Database(path.join(folder, 'workspace.sqlite'));
      db.pragma('journal_mode=WAL');
      db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,data TEXT NOT NULL,connection TEXT NOT NULL);
        CREATE TABLE assets(id TEXT PRIMARY KEY,sha256 TEXT NOT NULL UNIQUE,relative_path TEXT NOT NULL,data TEXT NOT NULL);
        CREATE TABLE tasks(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),asset_id TEXT NOT NULL REFERENCES assets(id),status TEXT NOT NULL CHECK(status IN ('pending','cancelled')),data TEXT NOT NULL);
        CREATE UNIQUE INDEX unfinished_task ON tasks(account_id,asset_id) WHERE status='pending';
        CREATE TABLE task_events(id INTEGER PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),event TEXT NOT NULL,created_at TEXT NOT NULL);
        PRAGMA user_version=1;`);
      const account = { id: crypto.randomUUID(), name: '旧版自有账号', handle: '', group: '门店', color: 'olive', initial: '旧', demo: false, followers: '—', loginStatus: 'not_logged_in' };
      const bytes = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex');
      const asset = { id: crypto.randomUUID(), title: '旧素材', filename: '原视频.mp4', poster: 'poster', tag: '本地导入', duration: '未分析', size: '0.1 MB', imported: true, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), availability: 'ready' };
      const relativePath = path.join('media', asset.id + '.mp4'); fs.writeFileSync(path.join(folder, relativePath), bytes);
      db.prepare('INSERT INTO accounts VALUES (?,?,?)').run(account.id, JSON.stringify(account), JSON.stringify({ accountId: account.id, status: 'not_logged_in' }));
      db.prepare('INSERT INTO assets VALUES (?,?,?,?)').run(asset.id, asset.sha256, relativePath, JSON.stringify(asset));
      let pendingId = '';
      for (const status of ['pending', 'cancelled']) {
        const task = { id: crypto.randomUUID(), accountId: account.id, assetId: asset.id, title: '历史标题 ' + status, status, time: '手动执行' };
        db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?)').run(task.id, account.id, asset.id, status, JSON.stringify(task));
        db.prepare('INSERT INTO task_events(task_id,event,created_at) VALUES(?,?,?)').run(task.id, '旧版历史事件', new Date().toISOString());
        if (status === 'pending') pendingId = task.id;
      }
      db.close(); return pendingId;
    }, legacyDir);
    await app.close(); app = await launch(legacyDir);
    let page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '让创作，井井有条。' })).toBeVisible();
    const migrated = await page.evaluate(() => window.xumu!.getSnapshot());
    expect(migrated.tasks.map(t => t.status).sort()).toEqual(['cancelled', 'pending']);
    expect(migrated.tasks.every(t => t.revision === 1)).toBe(true);
    const details = await page.evaluate(id => window.xumu!.getPublishTaskDetails(id), taskId);
    expect(details.events[0].summary).toBe('旧版历史事件');
    await page.evaluate(id => window.xumu!.updatePublishDraft({ taskId: id, expectedRevision: 1, title: '打包版新修订', description: '重启后仍保留的说明', tags: ['门店'] }), taskId);
    expect(await app.evaluate(({ app }) => { const require = process.getBuiltinModule('module')!.createRequire(app.getAppPath() + '/package.json'); return require('node:fs').readdirSync(app.getPath('userData')).filter((n: string) => n.startsWith('workspace-backup-')).length; })).toBe(1);
    await app.close(); app = await launch(legacyDir); page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '让创作，井井有条。' })).toBeVisible();
    const restored = await page.evaluate(id => window.xumu!.getPublishTaskDetails(id), taskId);
    expect(restored.task).toMatchObject({ title: '打包版新修订', description: '重启后仍保留的说明', tags: ['门店'], revision: 2, status: 'pending' });
    const review = await page.evaluate(id => window.xumu!.reviewPublish({ taskIds: [id] }), taskId);
    expect(review.readyTaskIds).toEqual([]);
    expect(review.rows[0].blockers.length).toBeGreaterThan(0);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('packaged comments migrate schema2 publication receipts and recover uncertain replies without resending',async()=>{
 test.setTimeout(60000);
 const executable=resolve(process.platform==='win32'?'release/win-unpacked/xumu-workspace.exe':'release/linux-unpacked/xumu-workspace');expect(existsSync(executable)).toBe(true);
 const root=await mkdtemp(join(tmpdir(),'序幕 comments migration ')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const launch=(folder:string)=>_electron.launch({executablePath:executable,args:[...(process.platform==='linux'?['--no-sandbox']:[]),`--user-data-dir=${folder}`],env});
 let app=await launch(join(root,'bootstrap'));
 try{let page=await app.firstWindow();await expect(page.getByRole('heading',{name:'让创作，井井有条。'})).toBeVisible();const folder=join(root,'schema2 副本');
  const legacy=await app.evaluate(({app},folder)=>{
   const require=process.getBuiltinModule('module')!.createRequire(app.getAppPath()+'/package.json'),p=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),Database=require('better-sqlite3'),{Repository}=require(p.join(app.getAppPath(),'dist-desktop/desktop/storage/repository.js'));const repo=new Repository(folder);repo.initialize();
   const account=repo.createAccount({name:'仅本地打包验收',group:'测试副本'}),bytes=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'),asset={id:crypto.randomUUID(),title:'迁移素材',filename:'测试.mp4',poster:'poster',tag:'本地测试',duration:'未分析',size:'0.1 MB',imported:true,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),availability:'ready'};
   fs.mkdirSync(p.join(folder,'media'),{recursive:true});const relative=p.join('media',asset.id+'.mp4');fs.writeFileSync(p.join(folder,relative),bytes);repo.addAsset(asset,relative);const task=repo.createTasks({assetId:asset.id,accountIds:[account.id],title:'迁移前已发布'})[0];const row={taskId:task.id,revision:task.revision,accountId:account.id,assetId:asset.id,assetSha256:asset.sha256,title:task.title,description:task.description,tags:task.tags,identity:{remoteId:'local-package-owner',displayName:'本地测试身份',observedAt:new Date().toISOString()},contextId:crypto.randomUUID(),blockers:[]};repo.publishing.reserveBatch(crypto.randomUUID(),[row]);const attempt=repo.publishing.getAttempt(task.id);repo.publishing.beginPreparation(attempt.id);repo.publishing.beginSubmit(attempt.id);repo.publishing.recordReceipt(attempt.id,{remoteWorkId:'package-published-work',accountRemoteId:'local-package-owner',officialUrl:'https://creator.douyin.com/fixture/work/packaged',state:'published',observedAt:new Date().toISOString()});const expected=repo.publishing.getDetails(task.id);repo.close();
   const db=new Database(p.join(folder,'workspace.sqlite'));db.pragma('foreign_keys=ON');for(const name of['comment_reply_checks','comment_events','comment_reply_attempts','comment_drafts','comment_sync','comments'])db.exec('DROP TABLE '+name);db.pragma('user_version=2');db.close();return{accountId:account.id,taskId:task.id,expected};
  },folder);
  await app.close();app=await launch(folder);page=await app.firstWindow();await expect(page.getByRole('heading',{name:'让创作，井井有条。'})).toBeVisible();expect(await page.evaluate(id=>window.xumu!.getPublishTaskDetails(id),legacy.taskId)).toEqual(legacy.expected);
  const ids=await app.evaluate(({app},accountId)=>{
   const require=process.getBuiltinModule('module')!.createRequire(app.getAppPath()+'/package.json'),p=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),Database=require('better-sqlite3'),{Repository}=require(p.join(app.getAppPath(),'dist-desktop/desktop/storage/repository.js'));const repo=new Repository(app.getPath('userData'));repo.initialize();try{repo.comments.startSync(accountId);repo.comments.completeSync(accountId,'local-package-owner',[0,1].map(i=>({ownerRemoteId:'local-package-owner',remoteWorkId:'package-published-work',remoteThreadId:'package-thread',remoteCommentId:'package-comment-'+i,authorRemoteId:'package-author-'+i,authorName:'本地测试作者',text:'打包验收源评论'+i,remoteCreatedAt:new Date().toISOString(),observedAt:new Date().toISOString(),availability:'present'})),null,'end');const comments=repo.comments.list({accountId,offset:0,limit:20}).comments;
    comments.forEach((c:any,i:number)=>{const d=repo.comments.saveDraft({commentId:c.id,expectedRevision:0,text:i===0?'待核对仍保留的草稿':'已发送仍保留的草稿'});const now=new Date().toISOString(),review={id:crypto.randomUUID(),commentId:c.id,accountId,sourceRevision:c.sourceRevision,draftRevision:d.revision,ownerRemoteId:c.ownerRemoteId,remoteWorkId:c.remoteWorkId,remoteThreadId:c.remoteThreadId,remoteCommentId:c.remoteCommentId,authorRemoteId:c.authorRemoteId,authorName:c.authorName,sourceText:c.text,text:d.text,identity:{remoteId:c.ownerRemoteId,displayName:'本地测试身份',observedAt:now},contextId:crypto.randomUUID(),capabilityVersion:'package-fixture',createdAt:now,expiresAt:new Date(Date.now()+300000).toISOString(),blockers:[]};const attempt=repo.comments.reserveReply(review);repo.comments.beginReplySubmit(attempt.id);if(i===1)repo.comments.recordReplyReceipt(attempt.id,{remoteReplyId:'unique-packaged-reply',accountRemoteId:c.ownerRemoteId,remoteWorkId:c.remoteWorkId,remoteThreadId:c.remoteThreadId,remoteCommentId:c.remoteCommentId,recipientRemoteId:c.authorRemoteId,state:'sent',officialUrl:'https://creator.douyin.com/fixture/comment/packaged',observedAt:now});});
    const db=new Database(p.join(app.getPath('userData'),'workspace.sqlite'),{readonly:true});const version=db.pragma('user_version',{simple:true});db.close();return{unknown:comments[0].id,sent:comments[1].id,version,backups:fs.readdirSync(app.getPath('userData')).filter((n:string)=>n.startsWith('workspace-backup-')).length};
   }finally{repo.close();}
  },legacy.accountId);expect(ids.version).toBe(3);expect(ids.backups).toBe(1);
  for(let restart=0;restart<2;restart++){await app.close();app=await launch(folder);page=await app.firstWindow();await expect(page.getByRole('heading',{name:'让创作，井井有条。'})).toBeVisible();const unknown=await page.evaluate(id=>window.xumu!.getCommentDetails(id),ids.unknown),sent=await page.evaluate(id=>window.xumu!.getCommentDetails(id),ids.sent);expect(unknown).toMatchObject({replyState:'review',draft:{text:'待核对仍保留的草稿',revision:1}});expect(sent).toMatchObject({replyState:'sent',draft:{text:'已发送仍保留的草稿',revision:1},receipt:{remoteReplyId:'unique-packaged-reply'}});expect(unknown.events.filter(e=>e.kind==='reply_submit_intent')).toHaveLength(1);const review=await page.evaluate(id=>window.xumu!.reviewCommentReply({commentId:id}),ids.unknown);expect(review.blockers.length).toBeGreaterThan(0);expect(await page.evaluate(()=>window.xumu!.getCommentSummary())).toMatchObject({total:2,unprocessed:2});}
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
