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
async function createCommentServiceFixture(dir,{count=2,unverified=false,budgets}={}){
 const{chromium}=require('playwright-core'),{findBrowser}=require(p.join(process.cwd(),'dist-desktop/desktop/browser/session-manager.js'));
 const{CommentsService}=require(p.join(process.cwd(),'dist-desktop/desktop/comments/service.js')),{UnverifiedCommentsAdapter}=require(p.join(process.cwd(),'dist-desktop/desktop/comments/adapter.js')),{OperationCoordinator}=require(p.join(process.cwd(),'dist-desktop/desktop/publishing/coordinator.js'));
 const f=createCommentsFixture(dir,count),browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:process.platform==='linux'?['--no-sandbox']:[]}),pages=new Map(),contexts=new Map(),ids=new Map();
 const state={identity:new Map(),canRead:true,canReply:true,version:'fixture-comments-v1',readCalls:[],readHook:null,onClose:null,closed:[],prepareCalls:0,submitCalls:0,readReplyCalls:0,prepareHook:null,submitHook:null,targetHook:null,resultHook:null};
 for(const account of f.accounts){const context=await browser.newContext(),page=await context.newPage();await page.setContent('<main data-owner="fixture-'+account.id+'"><article data-comment="shared-comment">本地夹具评论</article></main>');contexts.set(account.id,context);pages.set(account.id,page);ids.set(account.id,f.randomUUID());}
 const accountFor=page=>f.accounts.find(a=>pages.get(a.id)===page);
 const sessions={withAccountPage:async(accountId,work)=>{const page=pages.get(accountId);if(!page||page.isClosed())throw new Error('未打开账号登录窗口');return work(page,ids.get(accountId));},close:async accountId=>{await contexts.get(accountId)?.close();state.closed.push(accountId);state.onClose?.(accountId);}};
 const observation=async page=>{const account=accountFor(page),owner=await page.locator('main').getAttribute('data-owner');return{identity:{remoteId:state.identity.get(account.id)||owner,displayName:'本地夹具身份',observedAt:new Date().toISOString()},canRead:state.canRead,canReply:state.canReply,version:state.version};};
 const adapter={observe:observation,readComments:async(page,cursor,signal)=>{const account=accountFor(page);state.readCalls.push({accountId:account.id,cursor});if(state.readHook)return state.readHook(page,cursor,signal);const text=await page.locator('article').innerText();return{comments:[f.observed(account,{text})],nextCursor:null,coverage:'end'};}};
 const replyReceipt=review=>({remoteReplyId:'fixture-reply-'+review.id,accountRemoteId:review.ownerRemoteId,remoteWorkId:review.remoteWorkId,remoteThreadId:review.remoteThreadId,remoteCommentId:review.remoteCommentId,recipientRemoteId:review.authorRemoteId,state:'sent',officialUrl:'https://creator.douyin.com/fixture/comment/'+review.commentId,observedAt:new Date().toISOString()});
 adapter.observeReplyTarget=async(page,review)=>{
  if(state.targetHook)return state.targetHook(page,review);
  const account=accountFor(page),dom=await page.evaluate(()=>{const main=document.querySelector('main'),article=main?.querySelector('article');return{owner:main?.getAttribute('data-owner'),work:main?.getAttribute('data-work')||'shared-work',thread:main?.getAttribute('data-thread')||'shared-thread',comment:article?.getAttribute('data-comment'),author:article?.getAttribute('data-author')||'author-1',name:article?.getAttribute('data-name')||'同名作者',text:article?.textContent,availability:article?.getAttribute('data-state')||'present'};});
  const observed={identity:{remoteId:state.identity.get(account.id)||dom.owner,displayName:'本地夹具身份',observedAt:new Date().toISOString()},canRead:state.canRead,canReply:state.canReply,version:state.version};
  return{observation:observed,comment:dom.comment?f.observed(account,{ownerRemoteId:dom.owner,remoteWorkId:dom.work,remoteThreadId:dom.thread,remoteCommentId:dom.comment,authorRemoteId:dom.author,authorName:dom.name,text:dom.text,availability:dom.availability}):null};
 };
 adapter.prepareReply=async(page,review,signal)=>{state.prepareCalls++;await page.locator('main').evaluate((el,text)=>{let input=el.querySelector('textarea');if(!input){input=document.createElement('textarea');el.append(input);}input.value=text;},review.text);if(state.prepareHook)await state.prepareHook(page,review,signal);};
 adapter.submitReply=async(page,review)=>{const target=await page.evaluate(()=>({owner:document.querySelector('main')?.getAttribute('data-owner'),comment:document.querySelector('article')?.getAttribute('data-comment')}));if(target.owner!==review.ownerRemoteId||target.comment!==review.remoteCommentId)throw new Error('夹具目标变化');state.submitCalls++;return state.submitHook?state.submitHook(page,review):replyReceipt(review);};
 adapter.readReplyResult=async(page,attempt)=>{state.readReplyCalls++;return state.resultHook?state.resultHook(page,attempt):null;};
 adapter.commentUrl=comment=>'https://creator.douyin.com/fixture/comment/'+comment.id;
 let clock=Date.now();const coordinator=new OperationCoordinator(),service=new CommentsService(f.comments,f.repo,sessions,coordinator,unverified?new UnverifiedCommentsAdapter():adapter,()=>clock,budgets);
 return{...f,browser,pages,contexts,ids,sessions,state,adapter,coordinator,service,advance(ms){clock+=ms;},async close(){await service.close();await coordinator.close();await browser.close();f.repo.close();}};
}
module.exports.createCommentServiceFixture=createCommentServiceFixture;

function replyReview(f,commentId){const{comment:c,draft:d}=f.comments.details(commentId),now=Date.now();return{id:f.randomUUID(),commentId:c.id,accountId:c.accountId,sourceRevision:c.sourceRevision,draftRevision:d.revision,ownerRemoteId:c.ownerRemoteId,remoteWorkId:c.remoteWorkId,remoteThreadId:c.remoteThreadId,remoteCommentId:c.remoteCommentId,authorRemoteId:c.authorRemoteId,authorName:c.authorName,sourceText:c.text,text:d.text,identity:{remoteId:c.ownerRemoteId,displayName:'本地夹具身份',observedAt:new Date(now).toISOString()},contextId:f.randomUUID(),capabilityVersion:'fixture-comments-v1',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString(),blockers:[]};}
module.exports.replyReview=replyReview;
