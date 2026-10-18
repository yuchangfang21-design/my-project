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
