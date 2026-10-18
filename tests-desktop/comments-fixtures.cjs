const p=require('node:path'),fs=require('node:fs');
const{createFixture}=require('./publishing-fixtures.cjs');
function createCommentsFixture(dir,count=2){
 const f=createFixture(dir,count);
 const observed=(account=f.accounts[0],override={})=>({ownerRemoteId:'fixture-'+account.id,remoteWorkId:'shared-work',remoteThreadId:'shared-thread',remoteCommentId:'shared-comment',authorRemoteId:'author-1',authorName:'同名作者',text:'本地夹具评论',remoteCreatedAt:'2026-10-18T00:00:00.000Z',observedAt:new Date().toISOString(),availability:'present',...override});
 const ingest=(account=f.accounts[0],rows=[observed(account)],cursor='cursor-1',coverage='end')=>{f.repo.comments.startSync(account.id);try{return f.repo.comments.completeSync(account.id,'fixture-'+account.id,rows,cursor,coverage);}catch(error){f.repo.comments.failSync(account.id,'READ_FAILED');throw error;}};
 return{...f,comments:f.repo.comments,observed,ingest};
}
function seedV2(dir){
 const f=createFixture(dir,1);const task=f.tasks[0];f.store.reserveBatch(f.randomUUID(),[f.row(task)]);const a=f.store.getAttempt(task.id);f.store.beginPreparation(a.id);f.store.beginSubmit(a.id);f.store.recordReceipt(a.id,f.receipt(task,'published'));const expected=f.store.getDetails(task.id);f.repo.close();
 const Database=require('better-sqlite3'),db=new Database(p.join(dir,'workspace.sqlite'));db.pragma('journal_mode=WAL');
 for(const name of['comment_reply_checks','comment_events','comment_reply_attempts','comment_drafts','comment_sync','comments'])db.exec('DROP TABLE IF EXISTS '+name);
 db.pragma('user_version=2');db.prepare("INSERT INTO task_events(task_id,event,created_at,kind) VALUES(?,?,?,'legacy')").run(task.id,'保留WAL内的事件',new Date().toISOString());
 return{db,expected,task};
}
module.exports={createCommentsFixture,seedV2};
