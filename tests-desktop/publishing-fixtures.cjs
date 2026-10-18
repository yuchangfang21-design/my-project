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
