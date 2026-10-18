const Database=require('better-sqlite3');const fs=require('node:fs');const p=require('node:path');const{randomUUID}=require('node:crypto');
function seedV1(dir,{invalidReference=false}={}){
 fs.mkdirSync(dir,{recursive:true});const db=new Database(p.join(dir,'workspace.sqlite'));db.pragma('journal_mode=WAL');if(invalidReference)db.pragma('foreign_keys=OFF');
 db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,data TEXT NOT NULL,connection TEXT NOT NULL);CREATE TABLE assets(id TEXT PRIMARY KEY,sha256 TEXT NOT NULL UNIQUE,relative_path TEXT NOT NULL,data TEXT NOT NULL);CREATE TABLE tasks(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),asset_id TEXT NOT NULL REFERENCES assets(id),status TEXT NOT NULL CHECK(status IN ('pending','cancelled')),data TEXT NOT NULL);CREATE UNIQUE INDEX unfinished_task ON tasks(account_id,asset_id) WHERE status='pending';CREATE TABLE task_events(id INTEGER PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),event TEXT NOT NULL,created_at TEXT NOT NULL);PRAGMA user_version=1;`);
 const account={id:randomUUID(),name:'迁移账号',handle:'',group:'门店',color:'olive',initial:'迁',demo:false,followers:'—',loginStatus:'not_logged_in'};
 const asset={id:randomUUID(),title:'原素材',filename:'原视频.mp4',poster:'poster',tag:'本地导入',duration:'未分析',size:'1 MB',imported:true,sha256:'a'.repeat(64),availability:'ready'};
 db.prepare('INSERT INTO accounts VALUES (?,?,?)').run(account.id,JSON.stringify(account),JSON.stringify({accountId:account.id,status:'not_logged_in'}));
 db.prepare('INSERT INTO assets VALUES (?,?,?,?)').run(asset.id,asset.sha256,p.join('media',randomUUID()+'.mp4'),JSON.stringify(asset));
 const tasks=['pending','cancelled'].map((status,i)=>({id:randomUUID(),accountId:invalidReference&&i===0?randomUUID():account.id,assetId:asset.id,title:'历史标题'+i,status,time:'手动执行'}));
 for(const task of tasks){db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?)').run(task.id,task.accountId,task.assetId,task.status,JSON.stringify(task));db.prepare('INSERT INTO task_events(task_id,event,created_at) VALUES(?,?,?)').run(task.id,'历史事件',new Date().toISOString());}
 return{db,account,asset,tasks};
}
module.exports={seedV1};
function createFixture(dir,count=3){
 const{Repository}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js'));const crypto=require('node:crypto');
 const repo=new Repository(dir);repo.initialize();const bytes=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
 const asset={id:randomUUID(),title:'发布测试素材',filename:'测试视频.mp4',poster:'poster',tag:'本地导入',duration:'未分析',size:'0.1 MB',imported:true,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),availability:'ready'};
 fs.mkdirSync(p.join(dir,'media'),{recursive:true});fs.writeFileSync(p.join(dir,'media',asset.id+'.mp4'),bytes);repo.addAsset(asset,p.join('media',asset.id+'.mp4'));
 const accounts=Array.from({length:count},(_,i)=>repo.createAccount({name:'夹具账号'+(i+1),group:'测试'}));const tasks=repo.createTasks({assetId:asset.id,accountIds:accounts.map(a=>a.id),title:'已保存的作品标题'});
 const contexts=new Map(accounts.map(a=>[a.id,randomUUID()]));
 const row=task=>{const t=repo.publishing.task(task.id);return{taskId:t.id,revision:t.revision,accountId:t.accountId,assetId:t.assetId,assetSha256:t.assetSha256,title:t.title,description:t.description,tags:t.tags,identity:{remoteId:'fixture-'+t.accountId,displayName:'夹具身份',observedAt:new Date().toISOString()},contextId:contexts.get(t.accountId),blockers:[]};};
 const receipt=(task,state='pending_review')=>({remoteWorkId:'fixture-work-'+task.id,accountRemoteId:'fixture-'+task.accountId,officialUrl:'https://creator.douyin.com/fixture/work/'+task.id,state,observedAt:new Date().toISOString()});
 return{repo,store:repo.publishing,asset,accounts,tasks,row,receipt,contexts,randomUUID};
}
module.exports.createFixture=createFixture;
