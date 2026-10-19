import{test,expect}from'@playwright/test';import{mkdtemp,rm,writeFile}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{launchDesktop}from'./helpers';
for(const scenario of['public_default','no_private_control','current_visibility_kept','copy_changed','unavailable_receipt','css_cover','hidden_status','status_other_row'])test(`site-default publishing ${scenario} preserves the official visibility without a private setting`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'xumu-default-publish-')),app=await launchDesktop(root);await writeFile(join(root,'synthetic.mp4'),Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'));
 try{const r=await app.evaluate(async(_e,{root,scenario})=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path'),{createPrivatePublishFixture}=require(p.join(process.cwd(),'tests-desktop/private-publish-fixture.cjs'));
  const f=await createPrivatePublishFixture(root,{siteDefault:true,cssCover:['css_cover','hidden_status','status_other_row'].includes(scenario),receiptStatus:scenario==='hidden_status'?'hidden':scenario==='status_other_row'?'other_row':undefined});if(!f)return{available:false};
  try{
   f.adapter.privacy=()=>{throw new Error('Default mode must not read or modify private controls');};
   const observation=await f.adapter.observe(f.page);await f.adapter.prepare(f.page,{attemptId:'00000000-0000-4000-8000-000000000099',file:p.join(root,'synthetic.mp4'),title:'官网默认范围测试',description:'本地合成正文',tags:[]},new AbortController().signal);
   if(scenario==='no_private_control')await f.page.locator('#privacy-group').evaluate(group=>group.remove());
   if(scenario==='current_visibility_kept')await f.page.getByRole('radio',{name:'仅自己可见',exact:true}).check();
   if(scenario==='copy_changed')await f.page.locator('input[placeholder*="标题"]').fill('已变化的标题');
   if(scenario==='unavailable_receipt')f.page.on('response',(response:any)=>{if(response.request().method()==='POST')response.body=async()=>{throw new Error('Synthetic unavailable response body');};});
   let receipt=null,error=false;try{receipt=await f.adapter.submit(f.page);}catch{error=true;}
   let duplicateBlocked=false;try{await f.adapter.submit(f.page);}catch{duplicateBlocked=true;}
   return{available:true,observation,receipt,diagnostic:f.adapter.resultDiagnostic(f.page),error,duplicateBlocked,posts:f.state.posts};
  }finally{await f.close();}
 },{root,scenario});expect(r.available).toBe(true);expect(r.observation?.publicationMode).toBe('site_default_test');
 if(scenario==='copy_changed'){expect(r.error).toBe(true);expect(r.posts).toEqual([]);}else{expect(r.error).toBe(false);expect(r.posts).toEqual([{title:'官网默认范围测试',description:'本地合成正文',visibility:scenario==='current_visibility_kept'?'private':'public'}]);if(['unavailable_receipt','hidden_status','status_other_row'].includes(scenario))expect(r.receipt).toBeNull();else expect(r.receipt).toMatchObject({state:'published',remoteWorkId:'9007199254741993'});expect(r.duplicateBlocked).toBe(true);if(scenario==='unavailable_receipt')expect(r.diagnostic).toBe('RECEIPT_RESPONSE_UNREADABLE');else if(scenario==='hidden_status'||scenario==='status_other_row')expect(r.diagnostic).toBe('RECEIPT_STATUS_UNMATCHED');else expect(r.diagnostic).toBeNull();}
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
