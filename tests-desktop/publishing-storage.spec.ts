import{test,expect}from'@playwright/test';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{launchDesktop}from'./helpers';
test('publishing storage migrates WAL records and preserves immutable titles and revisions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-pub-storage-'));const app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json');const fs=require('node:fs'),p=require('node:path');const{seedV1}=require(p.join(process.cwd(),'tests-desktop/publishing-fixtures.cjs'));const{Repository}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js'));const Database=require('better-sqlite3');
  const dir=p.join(root,'v1');const old=seedV1(dir);const wal=fs.statSync(p.join(dir,'workspace.sqlite-wal')).size>0;
  const repo=new Repository(dir);repo.initialize();const check=new Database(repo.file);const version=check.pragma('user_version',{simple:true});check.close();
  if(!repo.publishing){repo.close();old.db.close();return{version,wal,missingStore:true};}
  const tasks=repo.publishing.listTasks();repo.updateAsset(old.asset.id,{title:'新素材标题',tag:'新分类'});const before=repo.publishing.getDetails(old.tasks[0].id);
  const edited=repo.publishing.updateDraft({taskId:old.tasks[0].id,expectedRevision:1,title:'为此账号修改',description:'独立说明',tags:['门店']});let stale=false;try{repo.publishing.updateDraft({taskId:edited.id,expectedRevision:1,title:'旧请求',description:'',tags:[]});}catch{stale=true;}
  let cancelledEdit=false;try{repo.publishing.updateDraft({taskId:old.tasks[1].id,expectedRevision:1,title:'不得编辑',description:'',tags:[]});}catch{cancelledEdit=true;}
  const backup=fs.readdirSync(dir).find((n:string)=>n.startsWith('workspace-backup-'));const backupDb=new Database(p.join(dir,backup),{readonly:true});const backupRows=backupDb.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;backupDb.close();
  const result={version,wal,ids:tasks.map((t:any)=>t.id).sort(),oldIds:old.tasks.map((t:any)=>t.id).sort(),revisions:tasks.map((t:any)=>t.revision),events:before.events.map((e:any)=>e.summary),title:before.task.title,edited,stale,cancelledEdit,backupRows};repo.close();old.db.close();return result;
 },dir);expect(r.version).toBe(3);expect(r.wal).toBe(true);expect(r.ids).toEqual(r.oldIds);expect(r.revisions).toEqual([1,1]);expect(r.events).toEqual(['历史事件']);expect(r.title).toBe('历史标题0');expect(r.edited).toMatchObject({revision:2,title:'为此账号修改',description:'独立说明',tags:['门店']});expect(r.stale).toBe(true);expect(r.cancelledEdit).toBe(true);expect(r.backupRows).toBe(2);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('publishing storage rolls back invalid foreign references and restores foreign key enforcement',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-pub-invalid-'));const app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json');const p=require('node:path');const{seedV1}=require(p.join(process.cwd(),'tests-desktop/publishing-fixtures.cjs'));const{migrateDatabase}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/migrations.js'));const f=seedV1(p.join(root,'invalid'),{invalidReference:true});f.db.pragma('foreign_keys=ON');let rejected=false;try{migrateDatabase(f.db,p.join(root,'invalid'));}catch{rejected=true;}const result={rejected,version:f.db.pragma('user_version',{simple:true}),keys:f.db.pragma('foreign_keys',{simple:true}),rows:f.db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n};f.db.close();return result;},dir);expect(r).toEqual({rejected:true,version:1,keys:1,rows:2});}finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('publishing storage refuses migration when the backup cannot be written',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-pub-backup-')),app=await launchDesktop(dir);
 try{const result=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path'),fs=require('node:fs');
  const{seedV1}=require(p.join(process.cwd(),'tests-desktop/publishing-fixtures.cjs')),{withBackupWritesDenied,databaseSnapshot}=require(p.join(process.cwd(),'tests-desktop/backup-permissions.cjs'));
  const{migrateDatabase}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/migrations.js'));const target=p.join(root,'readonly'),old=seedV1(target);old.db.pragma('foreign_keys=ON');
  try{
   const before=databaseSnapshot(old.db);
   const denied=withBackupWritesDenied(root,target,()=>{let code='';try{migrateDatabase(old.db,target);}catch(error){code=(error as NodeJS.ErrnoException).code||'';}return{code,after:databaseSnapshot(old.db),backups:fs.readdirSync(target).filter((name:string)=>name.startsWith('workspace-backup-'))};});
   migrateDatabase(old.db,target);const recovered=databaseSnapshot(old.db);
   return{before,denied,recoveredVersion:recovered.version,restoredKeys:recovered.keys,rows:old.db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n,backups:fs.readdirSync(target).filter((name:string)=>name.startsWith('workspace-backup-')).length};
  }finally{old.db.close();}
 },dir);expect(['EACCES','EPERM']).toContain(result.denied.code);expect(result.denied.after).toEqual(result.before);expect(result.before.version).toBe(1);expect(result.denied.backups).toEqual([]);expect(result).toMatchObject({recoveredVersion:3,restoredKeys:1,rows:2,backups:1});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
