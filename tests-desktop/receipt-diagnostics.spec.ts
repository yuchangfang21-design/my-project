import{test,expect}from'@playwright/test';
import{mkdtemp,rm}from'node:fs/promises';
import{tmpdir}from'node:os';import{join}from'node:path';import{launchDesktop}from'./helpers';

test('unknown receipt records a bounded diagnostic and rechecks without submitting again',async()=>{
 const root=await mkdtemp(join(tmpdir(),'xumu-receipt-diagnostic-')),app=await launchDesktop(root);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');
  const{createServiceFixture,settleBatch}=require(p.join(process.cwd(),'tests-desktop/publishing-fixtures.cjs'));
  const f=await createServiceFixture(root,{count:1});
  let closed=false;try{
   let code='RECEIPT_RESPONSE_UNSEEN';f.adapter.resultDiagnostic=()=>code;
   f.state.submitHook=async()=>null;
   const task=f.tasks[0],review=await f.service.reviewPublish({taskIds:[task.id]}),batch=await f.service.startPublish({reviewId:review.id});await settleBatch(f,batch.id);
   const first=f.service.getPublishTaskDetails(task.id);
   code='RECEIPT_CAPTION_UNMATCHED';await f.service.recheckPublish(task.id);const second=await f.service.recheckPublish(task.id);
   const attempt=f.store.getAttempt(task.id);let rejected=false;try{f.store.recordResultDiagnostic(attempt.id,'arbitrary PRIVATE payload');}catch{rejected=true;}
   const notes=second.events.filter((e:any)=>e.kind==='receipt_diagnostic').map((e:any)=>e.summary);
   const result={firstNotes:first.events.filter((e:any)=>e.kind==='receipt_diagnostic').length,notes,status:second.task.status,posts:f.state.submitCalls.length,reads:f.state.readCalls.length,rejected,leaked:JSON.stringify(second).includes('arbitrary PRIVATE payload')};
   await f.close();closed=true;
   const{Repository}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js')),repo=new Repository(root);repo.initialize();try{return{...result,persisted:repo.publishing.getDetails(task.id).events.filter((e:any)=>e.kind==='receipt_diagnostic').length};}finally{repo.close();}
  }finally{if(!closed)await f.close();}
 },root);
 expect(r.firstNotes).toBe(1);expect(r.notes).toHaveLength(2);expect(r.notes[0]).toContain('发布响应');expect(r.notes[1]).toContain('文案');expect(r).toMatchObject({status:'review',posts:1,reads:2,rejected:true,leaked:false,persisted:2});
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});

test('adapter explains lost attempt evidence without uploading or submitting',async()=>{
 const root=await mkdtemp(join(tmpdir(),'xumu-missing-evidence-')),app=await launchDesktop(root);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path'),{createPrivatePublishFixture}=require(p.join(process.cwd(),'tests-desktop/private-publish-fixture.cjs'));
  const f=await createPrivatePublishFixture(root,{siteDefault:true});try{
   const receipt=await f.adapter.readResult(f.page,{});return{receipt,diagnostic:f.adapter.resultDiagnostic?.(f.page),posts:f.state.posts,uploads:f.state.uploadVisits};
  }finally{await f.close();}
 },root);expect(r).toEqual({receipt:null,diagnostic:'RECEIPT_STATE_MISSING',posts:[],uploads:0});
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});

for(const scenario of ['unmatched_path','missing_length','unsupported_id'])test('receipt diagnostic distinguishes '+scenario+' without relaxing acceptance',async()=>{
 const root=await mkdtemp(join(tmpdir(),'xumu-response-diagnostic-')),app=await launchDesktop(root);
 try{const r=await app.evaluate(async(_e,{root,scenario})=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path'),fs=require('node:fs');
  const{createPrivatePublishFixture}=require(p.join(process.cwd(),'tests-desktop/private-publish-fixture.cjs'));
  fs.writeFileSync(p.join(root,'synthetic.mp4'),Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'));
  const f=await createPrivatePublishFixture(root,{siteDefault:true,publishPath:scenario==='unmatched_path'?'/web/api/media/aweme/unsupported/':undefined});
  try{
   await f.adapter.observe(f.page);await f.adapter.prepare(f.page,{attemptId:'00000000-0000-4000-8000-000000000199',file:p.join(root,'synthetic.mp4'),title:'回执诊断',description:'',tags:[]},new AbortController().signal);
   if(scenario==='unsupported_id')f.state.badReceipt=true;
   if(scenario==='missing_length')f.page.on('response',(response:any)=>{if(response.request().method()==='POST'){const headers=response.headers.bind(response);response.headers=()=>({...headers(),'content-length':''});}});
   const receipt=await f.adapter.submit(f.page);let duplicateBlocked=false;try{await f.adapter.submit(f.page);}catch{duplicateBlocked=true;}
   return{receipt,diagnostic:f.adapter.resultDiagnostic(f.page),posts:f.state.posts.length,duplicateBlocked};
  }finally{await f.close();}
 },{root,scenario});expect(r).toEqual({receipt:null,diagnostic:scenario==='unmatched_path'?'RECEIPT_RESPONSE_UNSEEN':scenario==='missing_length'?'RECEIPT_RESPONSE_SIZE':'RECEIPT_ID_UNSUPPORTED',posts:1,duplicateBlocked:true});
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
