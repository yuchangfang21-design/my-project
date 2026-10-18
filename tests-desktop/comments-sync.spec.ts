import{test,expect}from'@playwright/test';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{launchDesktop}from'./helpers';
test('comments sync keeps account ownership and last good snapshot',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-sync-')),app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const f=await createCommentServiceFixture(p.join(root,'fixture'));
  try{for(const a of f.accounts)await f.service.syncComments({accountId:a.id});const list=await f.service.getCommentWorkspace({offset:0,limit:100}),first=list.comments.find((c:any)=>c.accountId===f.accounts[0].id);f.service.saveCommentDraft({commentId:first.id,expectedRevision:0,text:'保留的本地回复'});const cursor=f.comments.cursor(f.accounts[0].id),success=f.comments.syncStates()[0].lastSuccessAt;let calls=0;
   f.state.readHook=async()=>{if(++calls===2)throw new Error('第二页夹具读取失败');return{comments:[f.observed(f.accounts[0],{text:'不能提前落库'})],nextCursor:'page-two',coverage:'partial'};};
   const failed=await f.service.syncComments({accountId:f.accounts[0].id});const details=f.service.getCommentDetails(first.id);
   return{total:list.total,accounts:new Set(list.comments.map((c:any)=>c.accountId)).size,failed:failed.state,cursorKept:f.comments.cursor(f.accounts[0].id)===cursor,successKept:f.comments.syncStates()[0].lastSuccessAt===success,text:details.comment.text,draft:details.draft.text};
  }finally{await f.close();}
 },dir);expect(r).toEqual({total:2,accounts:2,failed:'failed',cursorKept:true,successKept:true,text:'本地夹具评论',draft:'保留的本地回复'});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments sync bounds pagination and rejects cyclic cursors without losing the previous result',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-pages-')),app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const f=await createCommentServiceFixture(p.join(root,'fixture'),{count:1});
  try{let page=0;f.state.readHook=async()=>({comments:[f.observed()],nextCursor:'cursor-'+(++page),coverage:'partial'});const first=await f.service.syncComments({accountId:f.accounts[0].id}),cursor=f.comments.cursor(f.accounts[0].id),success=first.lastSuccessAt;
   f.state.readHook=async(_page:any,current:string)=>({comments:[f.observed(f.accounts[0],{remoteCommentId:'uncommitted'})],nextCursor:current,coverage:'partial'});const cycle=await f.service.syncComments({accountId:f.accounts[0].id});
   return{page,coverage:first.coverage,count:first.count,state:cycle.state,total:f.comments.summary().total,cursor:f.comments.cursor(f.accounts[0].id)===cursor,lastSuccess:f.comments.syncStates()[0].lastSuccessAt===success};
  }finally{await f.close();}
 },dir);expect(r).toEqual({page:10,coverage:'partial',count:1,state:'failed',total:1,cursor:true,lastSuccess:true});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments sync refuses identity changes closed pages and malformed remote records',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-bad-source-')),app=await launchDesktop(dir);
 try{const results=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const results=[];
  for(const scenario of['identity','closed','owner','size']){const f=await createCommentServiceFixture(p.join(root,scenario),{count:1});try{
   f.state.readHook=async(page:any)=>{const row=f.observed();if(scenario==='identity')f.state.identity.set(f.accounts[0].id,'other-identity');if(scenario==='closed')await page.close();if(scenario==='owner')row.ownerRemoteId='wrong-owner';if(scenario==='size')row.text='x'.repeat(8001);return{comments:[row],nextCursor:null,coverage:'end'};};
   const result=await f.service.syncComments({accountId:f.accounts[0].id});results.push({scenario,state:result.state,total:f.comments.summary().total});
  }finally{await f.close();}}
  return results;
 },dir);expect(results).toEqual(['identity','closed','owner','size'].map(scenario=>({scenario,state:'failed',total:0})));}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments sync closes timed out context and waits before releasing the shared browser queue',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-timeout-')),app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const f=await createCommentServiceFixture(p.join(root,'fixture'),{count:1,budgets:{observeMs:5000,readMs:10,prepareMs:5000,submitMs:5000}});
  try{let ended=false,queuedSawEnded=false;f.state.readHook=()=>new Promise((_resolve,reject)=>{f.state.onClose=()=>{ended=true;reject(new Error('测试context已关闭'));};});const work=f.service.syncComments({accountId:f.accounts[0].id});const next=f.coordinator.run(async()=>{queuedSawEnded=ended;});const result=await work;await next;return{state:result.state,code:result.errorCode,closed:f.state.closed.length,ended,queuedSawEnded};}
  finally{await f.close();}
 },dir);expect(r).toEqual({state:'failed',code:'OPERATION_TIMEOUT',closed:1,ended:true,queuedSawEnded:true});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments sync production adapter stays disabled despite persisted login claims',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-disabled-')),app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const f=await createCommentServiceFixture(p.join(root,'fixture'),{count:1,unverified:true});
  try{const a=f.accounts[0];f.repo.recordConnection({accountId:a.id,status:'logged_in',identity:{remoteId:'fixture-'+a.id,displayName:'旧身份',observedAt:new Date().toISOString()}});const workspace=await f.service.getCommentWorkspace({accountId:a.id,offset:0,limit:100}),result=await f.service.syncComments({accountId:a.id});return{read:workspace.capabilities[0].read,reply:workspace.capabilities[0].reply,state:result.state,reads:f.state.readCalls.length,total:workspace.total};}
  finally{await f.close();}
 },dir);expect(r).toEqual({read:false,reply:false,state:'failed',reads:0,total:0});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('comments sync holds the queue until a timed out read settles even if context close fails',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-comments-close-failure-')),app=await launchDesktop(dir);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{createCommentServiceFixture}=require(p.join(process.cwd(),'tests-desktop/comments-fixtures.cjs'));const f=await createCommentServiceFixture(p.join(root,'fixture'),{count:1,budgets:{observeMs:5000,readMs:10,prepareMs:5000,submitMs:5000}});
  let release:()=>void=()=>undefined;
  try{let called:()=>void=()=>undefined,queued=false;const closeCalled=new Promise<void>(resolve=>{called=resolve;});f.state.readHook=()=>new Promise(resolve=>{release=()=>resolve({comments:[],nextCursor:null,coverage:'end'});});f.sessions.close=async()=>{called();throw new Error('夹具关闭失败');};
   const work=f.service.syncComments({accountId:f.accounts[0].id});await closeCalled;const after=f.coordinator.run(async()=>{queued=true;});for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));const beforeRelease=queued;release();const result=await work;await after;return{beforeRelease,afterRelease:queued,code:result.errorCode,state:result.state,total:f.comments.summary().total};
  }finally{release();await f.close();}
 },dir);expect(r).toEqual({beforeRelease:false,afterRelease:true,code:'OPERATION_TIMEOUT',state:'failed',total:0});}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
