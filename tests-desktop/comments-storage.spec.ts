import{test,expect}from'@playwright/test';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{launchDesktop}from'./helpers';
test('comments storage isolates remote keys and preserves draft revisions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-storage-')),app=await launchDesktop(dir);
 try{const result=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentsFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const f=createCommentsFixture(p.join(root,'fixture'));
  try{if(!f.comments)return{missing:true};for(const account of f.accounts)f.ingest(account);
   const list=f.comments.list({offset:0,limit:100}),first=list.comments.find((c:any)=>c.accountId===f.accounts[0].id),other=list.comments.find((c:any)=>c.accountId===f.accounts[1].id);
   const saved=f.comments.saveDraft({commentId:first.id,expectedRevision:0,text:'  完整回复\n保留换行  '});let stale=false;try{f.comments.saveDraft({commentId:first.id,expectedRevision:0,text:'过期编辑'});}catch{stale=true;}
   f.comments.markProcessed({commentId:first.id,processed:true});f.ingest(f.accounts[0],[f.observed(f.accounts[0],{text:'更新的源文'})]);
   let mismatch=0;for(const change of[{authorRemoteId:'another-author'},{ownerRemoteId:'another-owner'},{remoteThreadId:'wrong-thread'}])try{f.ingest(f.accounts[0],[f.observed(f.accounts[0],change)]);}catch{mismatch++;}
   const a=f.comments.details(first.id),b=f.comments.details(other.id);const cleared=f.comments.saveDraft({commentId:first.id,expectedRevision:1,text:''});
   return{missing:false,total:list.total,saved,stale,mismatch,sourceRevision:a.comment.sourceRevision,firstProcessed:a.comment.processed,otherProcessed:b.comment.processed,otherDraft:b.draft.text,keptDraft:a.draft.text,cleared:cleared.text,summary:f.comments.summary().unprocessed};
  }finally{f.repo.close();}
 },dir);expect(result).toMatchObject({missing:false,total:2,stale:true,mismatch:3,sourceRevision:2,firstProcessed:true,otherProcessed:false,otherDraft:'',keptDraft:'  完整回复\n保留换行  ',cleared:'',summary:1});expect(result.saved).toMatchObject({revision:1,text:'  完整回复\n保留换行  '});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments storage failed sync keeps old rows cursor and drafts and restart never resumes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-sync-store-')),app=await launchDesktop(dir);
 try{const result=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentsFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const{Repository}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js'));const data=p.join(root,'fixture'),f=createCommentsFixture(data,1);
  if(!f.comments){f.repo.close();return{missing:true};}
  try{f.ingest();const comment=f.comments.list({offset:0,limit:100}).comments[0];f.comments.saveDraft({commentId:comment.id,expectedRevision:0,text:'不应丢失'});f.comments.startSync(f.accounts[0].id);
   let rollback=false;try{f.comments.completeSync(f.accounts[0].id,'fixture-'+f.accounts[0].id,[f.observed(f.accounts[0],{remoteCommentId:'new-id'}),f.observed(f.accounts[0],{ownerRemoteId:'wrong-owner'})],'bad-cursor','end');}catch{rollback=true;}
   const before=f.comments.cursor(f.accounts[0].id);f.comments.failSync(f.accounts[0].id,'READ_FAILED');f.ingest(f.accounts[0],[],'cursor-2');const preserved=f.comments.list({offset:0,limit:100}).total;f.comments.startSync(f.accounts[0].id);f.repo.close();
   const repo=new Repository(data);repo.initialize();try{return{rollback,before,preserved,cursor:repo.comments.cursor(f.accounts[0].id),state:repo.comments.syncStates()[0].state,draft:repo.comments.details(comment.id).draft.text};}finally{repo.close();}
  }finally{f.repo.close();}
 },dir);expect(result).toEqual({rollback:true,before:'cursor-1',preserved:1,cursor:'cursor-2',state:'interrupted',draft:'不应丢失'});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments storage migrates schema2 WAL and retains published receipts and event history',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-v2-')),app=await launchDesktop(dir);
 try{const result=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path'),fs=require('node:fs'),Database=require('better-sqlite3');const{seedV2}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const{Repository}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js'));const data=p.join(root,'legacy'),old=seedV2(data),wal=fs.statSync(p.join(data,'workspace.sqlite-wal')).size>0;
  const repo=new Repository(data);repo.initialize();try{const db=new Database(repo.file,{readonly:true}),version=db.pragma('user_version',{simple:true});db.close();const details=repo.publishing.getDetails(old.task.id),backup=fs.readdirSync(data).find((n:string)=>n.startsWith('workspace-backup-'));let backupEvents=0;if(backup){const b=new Database(p.join(data,backup),{readonly:true});backupEvents=b.prepare('SELECT COUNT(*) AS n FROM task_events').get().n;b.close();}
   return{version,wal,receipt:details.task.receipt,expected:old.expected.task.receipt,status:details.task.status,eventPreserved:details.events.some((e:any)=>e.summary==='保留WAL内的事件'),backupEvents,empty:repo.comments?repo.comments.list({offset:0,limit:100}).total:null};
  }finally{repo.close();old.db.close();}
 },dir);expect(result).toMatchObject({version:3,wal:true,status:'published',eventPreserved:true,empty:0});expect(result.receipt).toEqual(result.expected);expect(result.backupEvents).toBeGreaterThan(0);}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments storage rolls back schema2 migration failure and keeps foreign keys enabled',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-rollback-')),app=await launchDesktop(dir);
 try{const result=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{seedV2}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const{migrateDatabase}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/migrations.js'));const data=p.join(root,'legacy'),old=seedV2(data);old.db.exec('CREATE TABLE comment_drafts(conflict INTEGER)');old.db.pragma('foreign_keys=ON');
  try{let rejected=false;try{migrateDatabase(old.db,data);}catch{rejected=true;}return{rejected,version:old.db.pragma('user_version',{simple:true}),keys:old.db.pragma('foreign_keys',{simple:true}),tasks:old.db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n,added:old.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='comments'").get().n};}finally{old.db.close();}
 },dir);expect(result).toEqual({rejected:true,version:2,keys:1,tasks:1,added:0});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments storage refuses schema2 migration when backup cannot be created',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-backup-')),app=await launchDesktop(dir);
 try{const result=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path'),fs=require('node:fs');const{seedV2}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const{migrateDatabase}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/migrations.js'));const data=p.join(root,'legacy'),old=seedV2(data);fs.chmodSync(data,0o500);
  try{let rejected=false;try{migrateDatabase(old.db,data);}catch{rejected=true;}return{rejected,version:old.db.pragma('user_version',{simple:true}),tasks:old.db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n};}finally{fs.chmodSync(data,0o700);old.db.close();}
 },dir);expect(result).toEqual({rejected:true,version:2,tasks:1});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
