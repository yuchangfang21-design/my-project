import{test,expect}from'@playwright/test';import{mkdtemp,rm,writeFile}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{launchDesktop}from'./helpers';
for(const scenario of['success','visibility_changed','identity_changed','unknown_receipt','unknown_form','replaced_controls','delayed_initial','delayed_return','delayed_draft'])test(`private publishing ${scenario} is bounded to one reviewed private submission`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'xumu-private-publish-')),app=await launchDesktop(root);await writeFile(join(root,'synthetic.mp4'),Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'));
 try{
 const r=await app.evaluate(async(_e,{root,scenario})=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path'),{createPrivatePublishFixture}=require(p.join(process.cwd(),'tests-desktop/private-publish-fixture.cjs'));
  const f=await createPrivatePublishFixture(root,{badForm:scenario==='unknown_form',delayInitial:scenario==='delayed_initial',delayReturn:['delayed_return','delayed_draft'].includes(scenario),draftAfterDelay:scenario==='delayed_draft'});if(!f)return{available:false};
  try{
   const observation=await f.adapter.observe(f.page);if(scenario==='unknown_form')return{available:true,canPublish:observation.canPublish,posts:f.state.posts};
   const input={attemptId:'00000000-0000-4000-8000-000000000001',file:p.join(root,'synthetic.mp4'),title:'夹具新作品',description:'本地夹具正文',tags:[]};
   if(scenario==='delayed_draft'){let code='';try{await f.adapter.prepare(f.page,input,new AbortController().signal);}catch(error:any){code=error.code;}return{available:true,code,posts:f.state.posts,draft:await f.page.locator('[contenteditable]').innerText()};}
   await f.adapter.prepare(f.page,input,new AbortController().signal);
   if(scenario==='visibility_changed')await f.page.getByRole('radio',{name:'公开',exact:true}).check();
   if(scenario==='identity_changed')f.state.owner='9007199254740994';
   if(scenario==='unknown_receipt')f.state.badReceipt=true;
   if(scenario==='replaced_controls'){
    const original=f.adapter.button.bind(f.adapter);f.adapter.button=(page:any)=>{const button=original(page),evaluate=button.evaluate.bind(button);button.evaluate=async(callback:any,args:any)=>{await page.evaluate(()=>{const group=document.querySelector('#privacy-group')!,next=group.cloneNode(true) as HTMLElement;next.querySelectorAll('input').forEach(node=>{node.checked=node.value==='public';});group.replaceWith(next);});return evaluate(callback,args);};return button;};
   }
   let receipt=null,error=false;try{receipt=await f.adapter.submit(f.page);}catch{error=true;}
   let duplicateBlocked=false;try{await f.adapter.submit(f.page);}catch{duplicateBlocked=true;}
   return{available:true,observation,receipt,error,duplicateBlocked,posts:f.state.posts};
  }finally{await f.close();}
 },{root,scenario});
 expect(r.available).toBe(true);
 if(scenario==='delayed_draft'){expect(r.code).toBe('PRIVATE_DRAFT_PRESENT');expect(r.posts).toEqual([]);expect(r.draft).toBe('既有草稿不可覆盖');}
 else if(scenario==='unknown_form'){expect(r.canPublish).toBe(false);expect(r.posts).toEqual([]);}
 else if(['visibility_changed','identity_changed','replaced_controls'].includes(scenario)){expect(r.error).toBe(true);expect(r.posts).toEqual([]);}
 else{expect(r.posts).toEqual([{title:'夹具新作品',description:'本地夹具正文',visibility:'private'}]);expect(r.duplicateBlocked).toBe(true);if(['success','delayed_initial','delayed_return'].includes(scenario))expect(r.receipt).toMatchObject({remoteWorkId:'9007199254741993',accountRemoteId:'douyin-account:9007199254740993',officialUrl:'https://www.douyin.com/user/self?modal_id=9007199254741993',state:'published'});else expect(r.receipt).toBeNull();}
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});

test('private publishing review blocks batches and unsupported copy before any upload',async()=>{
 const root=await mkdtemp(join(tmpdir(),'xumu-private-review-')),app=await launchDesktop(root);
 try{const r=await app.evaluate(async(_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path'),{createServiceFixture}=require(p.join(process.cwd(),'tests-desktop/publishing-fixtures.cjs')),f=await createServiceFixture(root,{count:2});
  try{const original=f.adapter.observe;f.adapter.observe=async(...args:any[])=>({...await original(...args),publicationMode:'private_test'});const batch=await f.service.reviewPublish({taskIds:f.tasks.map((t:any)=>t.id)});await f.service.updatePublishDraft({taskId:f.tasks[0].id,expectedRevision:1,title:'私密单条',description:'正文',tags:['不支持话题']});const tagged=await f.service.reviewPublish({taskIds:[f.tasks[0].id]});return{batch,tagged,uploads:f.state.prepareCalls.length};}finally{await f.close();}
 },root);expect(r.batch.readyTaskIds).toEqual([]);expect(r.tagged.readyTaskIds).toEqual([]);expect(r.tagged.rows[0].publicationMode).toBe('private_test');expect(r.uploads).toBe(0);
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
test('private publishing stores only matching self-modal receipt URLs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'xumu-private-receipt-')),app=await launchDesktop(root);
 try{const r=await app.evaluate((_e,root)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path'),{createFixture}=require(p.join(process.cwd(),'tests-desktop/publishing-fixtures.cjs')),f=createFixture(root,1);
  try{f.store.reserveBatch(f.randomUUID(),[f.row(f.tasks[0])]);const attempt=f.store.getAttempt(f.tasks[0].id);f.store.beginPreparation(attempt.id);f.store.beginSubmit(attempt.id);const receipt={...f.receipt(f.tasks[0],'published'),remoteWorkId:'9007199254741993',officialUrl:'https://www.douyin.com/user/self?modal_id=9007199254741993'};let rejects=0;for(const officialUrl of['https://www.douyin.com/user/self?modal_id=999','https://www.douyin.com/user/self?modal_id=9007199254741993&token=PRIVATE','https://www.douyin.com.evil.invalid/user/self?modal_id=9007199254741993'])try{f.store.recordReceipt(attempt.id,{...receipt,officialUrl});}catch{rejects++;}f.store.recordReceipt(attempt.id,receipt);return{rejects,status:f.store.task(f.tasks[0].id).status};}finally{f.repo.close();}
 },root);expect(r).toEqual({rejects:3,status:'published'});
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
