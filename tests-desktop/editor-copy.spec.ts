import{test,expect}from'@playwright/test';import{mkdtemp,rm,writeFile}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{launchDesktop}from'./helpers';
for(const scenario of['zero_width','bom','empty','text_changed','emoji_changed','requested_marker_lost'])test(`editor copy ${scenario} distinguishes formatting markers from requested content`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'xumu-editor-copy-')),app=await launchDesktop(root);await writeFile(join(root,'synthetic.mp4'),Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'));
 try{const r=await app.evaluate(async(_e,{root,scenario})=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path'),{createPrivatePublishFixture}=require(p.join(process.cwd(),'tests-desktop/private-publish-fixture.cjs'));
  const marker=scenario==='bom'?'\uFEFF':scenario==='requested_marker_lost'?'':'\u200B',description=scenario==='empty'?'':scenario==='emoji_changed'?'👩‍💻':scenario==='requested_marker_lost'?'测\u200B试正文':'可见正文';
  const f=await createPrivatePublishFixture(root,{siteDefault:true,editorMarker:marker});
  try{
   await f.adapter.observe(f.page);await f.adapter.prepare(f.page,{attemptId:'00000000-0000-4000-8000-000000000188',file:p.join(root,'synthetic.mp4'),title:'编辑器标记测试',description,tags:[]},new AbortController().signal);
   const readback=await f.page.locator('[contenteditable]').innerText();
   if(scenario==='text_changed')await f.page.locator('[contenteditable]').fill('其他正文');
   if(scenario==='emoji_changed')await f.page.locator('[contenteditable]').fill('👩💻');
   if(scenario==='requested_marker_lost')await f.page.locator('[contenteditable]').fill('测试正文');
   let receipt=null,blocked=false;try{receipt=await f.adapter.submit(f.page);}catch{blocked=true;}
   return{receipt,blocked,readback,marker,description,posts:f.state.posts};
  }finally{await f.close();}
 },{root,scenario});if(r.marker)expect(r.readback.startsWith(r.marker)).toBe(true);
 if(['text_changed','emoji_changed','requested_marker_lost'].includes(scenario)){expect(r.blocked).toBe(true);expect(r.posts).toEqual([]);}else{expect(r.blocked).toBe(false);expect(r.receipt).toMatchObject({state:'published'});expect(r.posts).toEqual([{title:'编辑器标记测试',description:r.description,visibility:'public'}]);}
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
