import{test,expect}from'@playwright/test';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{launchDesktop}from'./helpers';
test('comments replies bind exact source and draft revisions before any write',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-reply-binding-')),app=await launchDesktop(dir);
 try{const results=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const results=[];
  for(const scenario of['expired','draft','source','removed','unsupported','author']){
   const f=await createCommentServiceFixture(p.join(root,scenario),{count:1});
   try{f.ingest();const comment=f.comments.list({offset:0,limit:100}).comments[0];f.comments.saveDraft({commentId:comment.id,expectedRevision:0,text:'  完整回复\n不改换行  '});const review=await f.service.reviewCommentReply({commentId:comment.id});
    if(scenario==='expired')f.advance(300001);if(scenario==='draft')f.comments.saveDraft({commentId:comment.id,expectedRevision:1,text:'改过的回复'});
    if(scenario==='source')f.ingest(f.accounts[0],[f.observed(f.accounts[0],{text:'改过的源文'})]);if(scenario==='removed'||scenario==='unsupported')f.ingest(f.accounts[0],[f.observed(f.accounts[0],{availability:scenario,text:''})]);
    if(scenario==='author')await f.pages.get(f.accounts[0].id).locator('article').evaluate((el:any)=>el.setAttribute('data-author','another-stable-author'));
    try{await f.service.sendCommentReply({reviewId:review.id});}catch{}
    results.push({scenario,submits:f.state.submitCalls,prepares:f.state.prepareCalls,text:review.text,source:review.sourceText,author:review.authorRemoteId});
   }finally{await f.close();}
  }return results;
 },dir);expect(results).toEqual(['expired','draft','source','removed','unsupported','author'].map(scenario=>({scenario,submits:0,prepares:0,text:'  完整回复\n不改换行  ',source:'本地夹具评论',author:'author-1'})));}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments replies recheck the combined live target after delayed preparation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-live-target-')),app=await launchDesktop(dir);
 try{const results=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const results=[];
  for(const scenario of['identity','comment']){const f=await createCommentServiceFixture(p.join(root,scenario),{count:1});let release:()=>void=()=>undefined;
   try{f.ingest();const comment=f.comments.list({offset:0,limit:100}).comments[0];f.comments.saveDraft({commentId:comment.id,expectedRevision:0,text:'确认回复'});const review=await f.service.reviewCommentReply({commentId:comment.id}),original=f.adapter.observeReplyTarget;
    let called:()=>void=()=>undefined,count=0;const waiting=new Promise<void>(r=>{called=r;}),gate=new Promise<void>(r=>{release=r;});f.adapter.observeReplyTarget=async(page:any,input:any)=>{if(++count===2){called();await gate;}return original(page,input);};
    const sending=f.service.sendCommentReply({reviewId:review.id});await waiting;const page=f.pages.get(f.accounts[0].id);if(scenario==='identity')await page.locator('main').evaluate((el:any)=>el.setAttribute('data-owner','other-owner'));else await page.locator('article').evaluate((el:any)=>el.setAttribute('data-comment','another-comment'));release();const result=await sending;
    results.push({scenario,prepares:f.state.prepareCalls,submits:f.state.submitCalls,state:result.replyState,marked:result.events.some((e:any)=>e.kind==='reply_submit_intent')});
   }finally{release();await f.close();}
  }return results;
 },dir);expect(results).toEqual(['identity','comment'].map(scenario=>({scenario,prepares:1,submits:0,state:'failed',marked:false})));}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments replies deduplicate confirmation and match a unique sent receipt',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-reply-once-')),app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const f=await createCommentServiceFixture(p.join(root,'fixture'),{count:1});
  try{f.ingest();const comment=f.comments.list({offset:0,limit:100}).comments[0];f.comments.saveDraft({commentId:comment.id,expectedRevision:0,text:'谢谢你的留言'});const review=await f.service.reviewCommentReply({commentId:comment.id}),[a,b]=await Promise.all([f.service.sendCommentReply({reviewId:review.id}),f.service.sendCommentReply({reviewId:review.id})]);await f.service.sendCommentReply({reviewId:review.id});const next=await f.service.reviewCommentReply({commentId:comment.id});let blocked=false;try{await f.service.sendCommentReply({reviewId:next.id});}catch{blocked=true;}
   return{same:a.latestAttemptId===b.latestAttemptId,state:a.replyState,submits:f.state.submitCalls,receipt:a.receipt,expectedTarget:comment.remoteCommentId,blocked};
  }finally{await f.close();}
 },dir);expect(r).toMatchObject({same:true,state:'sent',submits:1,blocked:true});expect(r.receipt).toMatchObject({remoteCommentId:r.expectedTarget,recipientRemoteId:'author-1',state:'sent'});expect(r.receipt!.remoteReplyId).toBeTruthy();}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments replies quarantine ambiguous outcomes without resending',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-reply-unknown-')),app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const f=await createCommentServiceFixture(p.join(root,'fixture'),{count:1});
  try{f.ingest();const comment=f.comments.list({offset:0,limit:100}).comments[0];f.comments.saveDraft({commentId:comment.id,expectedRevision:0,text:'不确定后不能自动重发'});f.state.submitHook=async()=>null;const review=await f.service.reviewCommentReply({commentId:comment.id}),first=await f.service.sendCommentReply({reviewId:review.id});await f.service.recheckCommentReply(comment.id);const found=f.service.recordCommentReplyCheck({commentId:comment.id,attemptId:first.latestAttemptId,result:'found',note:'人工核对'}),blocked=await f.service.reviewCommentReply({commentId:comment.id});
   f.service.recordCommentReplyCheck({commentId:comment.id,attemptId:first.latestAttemptId,result:'not_found',note:'已核对未发送'});const fresh=await f.service.reviewCommentReply({commentId:comment.id});f.state.submitHook=null;const sent=await f.service.sendCommentReply({reviewId:fresh.id});
   return{first:first.replyState,found:found.replyState,blocked:blocked.blockers.length>0,reads:f.state.readReplyCalls,submits:f.state.submitCalls,final:sent.replyState,newAttempt:sent.latestAttemptId!==first.latestAttemptId,draft:sent.draft.text};
  }finally{await f.close();}
 },dir);expect(r).toEqual({first:'review',found:'review',blocked:true,reads:1,submits:2,final:'sent',newAttempt:true,draft:'不确定后不能自动重发'});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments replies reject mismatched receipts and recover around the durable marker',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-reply-store-')),app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentsFixture,replyReview}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const{Repository}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js'));const data=p.join(root,'fixture'),f=createCommentsFixture(data,3);
  try{const comments=f.accounts.map((a:any)=>{f.ingest(a);return f.comments.list({accountId:a.id,offset:0,limit:100}).comments[0];});for(const c of comments)f.comments.saveDraft({commentId:c.id,expectedRevision:0,text:'存储回归回复'});
   const attempts=comments.map((c:any)=>f.comments.reserveReply(replyReview(f,c.id)));f.comments.beginReplySubmit(attempts[2].id);const snap=attempts[2].snapshot,receipt={remoteReplyId:'work-reply',accountRemoteId:snap.ownerRemoteId,remoteWorkId:snap.remoteWorkId,remoteThreadId:snap.remoteThreadId,remoteCommentId:snap.remoteCommentId,recipientRemoteId:snap.authorRemoteId,state:'sent',officialUrl:'https://creator.douyin.com/fixture/comment',observedAt:new Date().toISOString()};let rejected=0;
   for(const bad of[{...receipt,accountRemoteId:'other'},{...receipt,remoteWorkId:'wrong'},{...receipt,remoteThreadId:'wrong'},{...receipt,remoteCommentId:'wrong'},{...receipt,recipientRemoteId:'wrong'},{...receipt,remoteReplyId:''},{...receipt,officialUrl:'https://evil.example/reply'}])try{f.comments.recordReplyReceipt(attempts[2].id,bad);}catch{rejected++;}
   f.repo.close();const reopened=new Repository(data);reopened.initialize();try{return{rejected,states:comments.map((c:any)=>reopened.comments.details(c.id).replyState),texts:comments.map((c:any)=>reopened.comments.details(c.id).draft.text),phases:comments.map((c:any)=>reopened.comments.getReplyAttempt(c.id).phase)};}finally{reopened.close();}
  }finally{f.repo.close();}
 },dir);expect(r).toEqual({rejected:7,states:['failed','failed','review'],texts:Array(3).fill('存储回归回复'),phases:Array(3).fill('finished')});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments replies preserve uncertainty on submit timeout and drain before the next operation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-reply-timeout-')),app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const f=await createCommentServiceFixture(p.join(root,'fixture'),{count:1,budgets:{observeMs:5000,readMs:5000,prepareMs:5000,submitMs:10}});
  try{f.ingest();const c=f.comments.list({offset:0,limit:100}).comments[0];f.comments.saveDraft({commentId:c.id,expectedRevision:0,text:'超时回归'});let ended=false,nextSawEnded=false;f.state.submitHook=()=>new Promise((_resolve,reject)=>{f.state.onClose=()=>{ended=true;reject(new Error('已关闭'));};});const review=await f.service.reviewCommentReply({commentId:c.id}),sending=f.service.sendCommentReply({reviewId:review.id});const next=f.coordinator.run(async()=>{nextSawEnded=ended;});const result=await sending;await next;return{state:result.replyState,ended,nextSawEnded,closed:f.state.closed.length,submits:f.state.submitCalls};}finally{await f.close();}
 },dir);expect(r).toEqual({state:'review',ended:true,nextSawEnded:true,closed:1,submits:1});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments replies stop pre-submit work on close and keep the production adapter disabled',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-reply-close-')),app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const f=await createCommentServiceFixture(p.join(root,'normal'),{count:1});let result;
  try{f.ingest();const c=f.comments.list({offset:0,limit:100}).comments[0];f.comments.saveDraft({commentId:c.id,expectedRevision:0,text:'关闭时不要发送'});let began:()=>void=()=>undefined;const ready=new Promise<void>(r=>{began=r;});f.state.prepareHook=async(_page:any,_review:any,signal:AbortSignal)=>new Promise((_resolve,reject)=>{began();signal.addEventListener('abort',()=>reject(new Error('已中止')),{once:true});});const review=await f.service.reviewCommentReply({commentId:c.id}),work=f.service.sendCommentReply({reviewId:review.id});await ready;const closing=f.service.close();const details=await work;await closing;result={state:details.replyState,submits:f.state.submitCalls};}finally{await f.close();}
  const disabled=await createCommentServiceFixture(p.join(root,'disabled'),{count:1,unverified:true});try{disabled.ingest();const c=disabled.comments.list({offset:0,limit:100}).comments[0];disabled.comments.saveDraft({commentId:c.id,expectedRevision:0,text:'未接通不能发送'});const review=await disabled.service.reviewCommentReply({commentId:c.id});let blocked=false;try{await disabled.service.sendCommentReply({reviewId:review.id});}catch{blocked=true;}const{UnverifiedCommentsAdapter}=require(p.join(process.cwd(),'dist-desktop/desktop/comments/adapter.js'));const adapter=new UnverifiedCommentsAdapter(),page=disabled.pages.get(disabled.accounts[0].id);let writesRejected=0;for(const action of[()=>adapter.observeReplyTarget(page,review),()=>adapter.prepareReply(page,review,new AbortController().signal),()=>adapter.submitReply(page,review),()=>adapter.readReplyResult(page,{snapshot:review})])try{await action();}catch{writesRejected++;}let openBlocked=false;try{await disabled.service.openCommentPage(c.id);}catch{openBlocked=true;}return{...result,blocked,disabledSubmits:disabled.state.submitCalls,blockers:review.blockers.length>0,writesRejected,openBlocked};}finally{await disabled.close();}
 },dir);expect(r).toEqual({state:'failed',submits:0,blocked:true,disabledSubmits:0,blockers:true,writesRejected:4,openBlocked:true});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments replies never reuse a remote receipt across attempts or edit an active draft',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-unique-receipt-')),app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentsFixture,replyReview}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const f=createCommentsFixture(p.join(root,'fixture'),1);
  try{f.ingest(f.accounts[0],[f.observed(),f.observed(f.accounts[0],{remoteCommentId:'second-comment'})]);const comments=f.comments.list({offset:0,limit:100}).comments;
   const attempts=comments.map((c:any)=>{f.comments.saveDraft({commentId:c.id,expectedRevision:0,text:'对应回复'});return f.comments.reserveReply(replyReview(f,c.id));});let editBlocked=false;try{f.comments.saveDraft({commentId:comments[0].id,expectedRevision:1,text:'不能改执行中内容'});}catch{editBlocked=true;}
   for(const a of attempts)f.comments.beginReplySubmit(a.id);const receipt=(a:any)=>({remoteReplyId:'same-reply-id',accountRemoteId:a.snapshot.ownerRemoteId,remoteWorkId:a.snapshot.remoteWorkId,remoteThreadId:a.snapshot.remoteThreadId,remoteCommentId:a.snapshot.remoteCommentId,recipientRemoteId:a.snapshot.authorRemoteId,state:'sent',officialUrl:'https://creator.douyin.com/fixture/reply',observedAt:new Date().toISOString()});f.comments.recordReplyReceipt(attempts[0].id,receipt(attempts[0]));let duplicate=false,changedId=false,repeatBlocked=false;
   try{f.comments.recordReplyReceipt(attempts[1].id,receipt(attempts[1]));}catch{duplicate=true;}try{f.comments.recordReplyReceipt(attempts[0].id,{...receipt(attempts[0]),remoteReplyId:'changed-id'});}catch{changedId=true;}try{f.comments.reserveReply(replyReview(f,comments[0].id));}catch{repeatBlocked=true;}
   return{editBlocked,duplicate,changedId,repeatBlocked,states:comments.map((c:any)=>f.comments.details(c.id).replyState),text:f.comments.details(comments[0].id).draft.text};
  }finally{f.repo.close();}
 },dir);expect(r).toEqual({editBlocked:true,duplicate:true,changedId:true,repeatBlocked:true,states:['sent','sending'],text:'对应回复'});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
