import{test,expect}from'@playwright/test';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{launchDesktop}from'./helpers';
test('publishing attempts reserve atomically and deduplicate confirmation IDs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-attempt-'));const app=await launchDesktop(dir);try{const r=await app.evaluate(async(_e,root)=>{
 const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json');const p=require('node:path');const{createFixture}=require(p.join(process.cwd(),'tests-desktop/publishing-fixtures.cjs'));const f=createFixture(p.join(root,'db'));
 try{const stale=f.tasks.slice(0,2).map(f.row);f.store.updateDraft({taskId:f.tasks[1].id,expectedRevision:1,title:'修订后的内容',description:'',tags:[]});let rejected=false;try{f.store.reserveBatch(f.randomUUID(),stale);}catch{rejected=true;}
 const before=f.store.getAttempt(f.tasks[0].id);const reviewId=f.randomUUID(),rows=f.tasks.slice(0,2).map(f.row);const first=f.store.reserveBatch(reviewId,rows),second=f.store.reserveBatch(reviewId,rows);return{rejected,before,id:first.id,same:second.id,attempts:f.tasks.slice(0,2).map((t:any)=>f.store.getAttempt(t.id)?.id)};}finally{f.repo.close();}
 },dir);expect(r.rejected).toBe(true);expect(r.before).toBeNull();expect(r.id).toBe(r.same);expect(new Set(r.attempts).size).toBe(2);}finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('publishing attempts recover pre-submit work and quarantine uncertain submissions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-recover-attempt-'));const app=await launchDesktop(dir);try{const r=await app.evaluate(async(_e,root)=>{
 const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json');const p=require('node:path');const{createFixture}=require(p.join(process.cwd(),'tests-desktop/publishing-fixtures.cjs'));const{Repository}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js'));const data=p.join(root,'db'),f=createFixture(data);const batch=f.store.reserveBatch(f.randomUUID(),f.tasks.map(f.row));
 f.store.beginPreparation(f.store.getAttempt(f.tasks[1].id).id);const last=f.store.getAttempt(f.tasks[2].id);f.store.beginPreparation(last.id);f.store.beginSubmit(last.id);let cancelRejected=false;try{f.store.cancelTask(f.tasks[2].id);}catch{cancelRejected=true;}f.repo.close();const reopen=new Repository(data);reopen.initialize();try{return{cancelRejected,statuses:f.tasks.map((t:any)=>reopen.publishing.task(t.id).status),batch:reopen.publishing.getBatch(batch.id).state,outcomes:f.tasks.map((t:any)=>reopen.publishing.getAttempt(t.id).outcome),events:reopen.publishing.getDetails(f.tasks[2].id).events.map((e:any)=>e.kind)};}finally{reopen.close();}
 },dir);expect(r).toMatchObject({cancelRejected:true,statuses:['pending','pending','review'],batch:'paused',outcomes:['not_submitted','not_submitted','review']});expect(r.events).toContain('submit_intent');expect(r.events).toContain('recovered');}finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('publishing attempts require matching receipts and separate manual checks from published results',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-receipt-'));const app=await launchDesktop(dir);try{const r=await app.evaluate(async(_e,root)=>{
 const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json');const p=require('node:path');const{createFixture}=require(p.join(process.cwd(),'tests-desktop/publishing-fixtures.cjs'));const f=createFixture(p.join(root,'db'),2);try{
 f.store.reserveBatch(f.randomUUID(),f.tasks.map(f.row));for(const t of f.tasks){const a=f.store.getAttempt(t.id);f.store.beginPreparation(a.id);f.store.beginSubmit(a.id);}
 const task=f.tasks[0],a=f.store.getAttempt(task.id);let invalid=0;for(const receipt of[{...f.receipt(task),accountRemoteId:'another-account'},{...f.receipt(task),remoteWorkId:''},{...f.receipt(task),officialUrl:'https://evil.example/work'},{...f.receipt(task),officialUrl:'https://name:secret@creator.douyin.com/work'}]){try{f.store.recordReceipt(a.id,receipt);}catch{invalid++;}}
 f.store.recordReceipt(a.id,f.receipt(task));const submitted=f.store.task(task.id).status;let pendingRepost=false;try{f.store.createRepostDraft({previousTaskId:task.id,expectedRevision:1,acknowledged:true});}catch{pendingRepost=true;}
 f.store.recordReceipt(a.id,f.receipt(task,'published'));let mismatchedWork=false;try{f.store.recordReceipt(a.id,{...f.receipt(task,'published'),remoteWorkId:'wrong-work'});}catch{mismatchedWork=true;}
 const repost=f.store.createRepostDraft({previousTaskId:task.id,expectedRevision:1,acknowledged:true});let duplicate=false;try{f.repo.createTasks({assetId:f.asset.id,accountIds:[task.accountId],title:'重复'});}catch{duplicate=true;}
 const uncertain=f.tasks[1],u=f.store.getAttempt(uncertain.id);f.store.finishAttempt(u.id,{kind:'review',errorCode:'RESULT_UNKNOWN'});const manual=f.store.recordManualCheck({taskId:uncertain.id,attemptId:u.id,result:'found',note:'自己核对的记录'});let blocked=true;try{f.store.reserveBatch(f.randomUUID(),[f.row(uncertain)]);blocked=false;}catch{}
 f.store.recordManualCheck({taskId:uncertain.id,attemptId:u.id,result:'not_found',note:'已在官方页面核实未发布'});f.store.reserveBatch(f.randomUUID(),[f.row(uncertain)]);const retry=f.store.getAttempt(uncertain.id);
 return{invalid,submitted,pendingRepost,mismatchedWork,repostOf:repost.repostOf,original:task.id,duplicate,manualStatus:manual.task.status,manualResult:manual.manualCheck.result,blocked,newAttempt:retry.id!==u.id};}finally{f.repo.close();}
 },dir);expect(r).toMatchObject({invalid:4,submitted:'submitted',pendingRepost:true,mismatchedWork:true,duplicate:true,manualStatus:'review',manualResult:'found',blocked:true,newAttempt:true});expect(r.repostOf).toBe(r.original);}finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('publishing review regression blocks stale ordinary and repost drafts after sibling submissions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xumu-sibling-history-'));const app=await launchDesktop(dir);
 try{const results=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');
  const{createFixture}=require(p.join(process.cwd(),'tests-desktop/publishing-fixtures.cjs'));const results=[];
  for(const state of['published','rejected']){
   const f=createFixture(p.join(root,state),1);
   try{
    const old=f.tasks[0],oldBatch=f.store.reserveBatch(f.randomUUID(),[f.row(old)]),oldAttempt=f.store.getAttempt(old.id);
    f.store.beginPreparation(oldAttempt.id);f.store.finishAttempt(oldAttempt.id,{kind:'not_submitted',errorCode:'PREPARE_FAILED'});f.store.pauseBatch(oldBatch.id);
    const newer=f.repo.createTasks({assetId:f.asset.id,accountIds:[old.accountId],title:'更新的任务'})[0];
    f.store.reserveBatch(f.randomUUID(),[f.row(newer)]);const a=f.store.getAttempt(newer.id);f.store.beginPreparation(a.id);f.store.beginSubmit(a.id);f.store.recordReceipt(a.id,f.receipt(newer,state));
    let ordinaryBlocked=false;try{f.store.reserveBatch(f.randomUUID(),[f.row(old)]);}catch{ordinaryBlocked=true;}
    const noNewAttempt=f.store.getAttempt(old.id).id===oldAttempt.id;
    if(!ordinaryBlocked)f.store.cancelTask(old.id);
    const repost=f.store.createRepostDraft({previousTaskId:newer.id,expectedRevision:1,acknowledged:true});
    const allowed=f.store.reserveBatch(f.randomUUID(),[f.row(repost)]),ra=f.store.getAttempt(repost.id);
    f.store.beginPreparation(ra.id);f.store.finishAttempt(ra.id,{kind:'not_submitted',errorCode:'PREPARE_FAILED'});f.store.pauseBatch(allowed.id);
    const latest=f.store.createRepostDraft({previousTaskId:newer.id,expectedRevision:1,acknowledged:true});
    f.store.reserveBatch(f.randomUUID(),[f.row(latest)]);const la=f.store.getAttempt(latest.id);f.store.beginPreparation(la.id);f.store.beginSubmit(la.id);f.store.recordReceipt(la.id,f.receipt(latest,state));
    let staleExplicitBlocked=false;try{f.store.reserveBatch(f.randomUUID(),[f.row(repost)]);}catch{staleExplicitBlocked=true;}
    results.push({state,ordinaryBlocked,noNewAttempt,explicitAccepted:!!allowed.id,staleExplicitBlocked});
   }finally{f.repo.close();}
  }return results;
 },dir);expect(results).toEqual(['published','rejected'].map(state=>({state,ordinaryBlocked:true,noNewAttempt:true,explicitAccepted:true,staleExplicitBlocked:true})));}
 finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
