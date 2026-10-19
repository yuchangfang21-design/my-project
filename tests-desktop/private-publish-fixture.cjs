// Synthetic official-page fixture. No credentials or real account/video data.
const p=require('node:path');
async function createPrivatePublishFixture(root,options={}){
 const{chromium}=require('playwright-core'),{findBrowser}=require(p.join(process.cwd(),'dist-desktop/desktop/browser/session-manager.js'));
 const adapters=require(p.join(process.cwd(),'dist-desktop/desktop/publishing/adapter.js')),Adapter=options.siteDefault?adapters.DouyinDefaultPublishAdapter:adapters.DouyinPrivatePublishAdapter;
 if(!Adapter)return null;
 const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:process.platform==='linux'?['--no-sandbox']:[]}),context=await browser.newContext(),page=await context.newPage();
 const state={owner:'9007199254740993',posts:[],workId:'9007199254741993',publications:0,uploadVisits:0,caption:'',badReceipt:false};
 // Keep the synthetic instant redirect from discarding CDP response bodies.
 // Real failures still return unknown; this only coordinates fixture navigation.
 const responseReads=new Set();
 page.on('response',response=>{
  if(response.request().method()!=='POST')return;
  const read=response.body.bind(response);
  response.body=()=>{const pending=read();responseReads.add(pending);void pending.then(()=>responseReads.delete(pending),()=>responseReads.delete(pending));return pending;};
 });
 await page.exposeFunction('__fixtureResponseReads',async()=>{await Promise.allSettled([...responseReads]);return null;});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(url.origin==='https://creator.douyin.com'&&path==='/passport/account/info/v2/')return route.fulfill({contentType:'application/json',body:JSON.stringify({message:'success',data:{user_id_str:state.owner,screen_name:'PRIVATE_NAME',app_id:2906,is_visitor_account:false}})});
  if(url.origin==='https://creator.douyin.com'&&path==='/web/api/media/aweme/create/'){
   const body=route.request().postDataJSON();state.posts.push(body);state.caption=[body.title,body.description].filter(Boolean).join(' ');state.publications++;
   const result=JSON.stringify({status_code:0,data:state.badReceipt?{}:{aweme_id:state.workId}});return route.fulfill({contentType:'application/json',headers:{'content-length':String(Buffer.byteLength(result))},body:result});
  }
  let body='<h1>本地官网夹具</h1>';
  if(path==='/creator-micro/content/upload')body=options.badForm?'<input type=file><input type=file>':`<h1>上传测试夹具</h1><input type="file" accept="video/*" id="file"><div id="form"></div><script>
   document.querySelector('#file').onchange=()=>{document.querySelector('#file').hidden=true;document.querySelector('#form').innerHTML='<input placeholder="填写作品标题" maxlength="30"><div contenteditable="true" role="textbox"></div><div id="privacy-group"><label><input type="radio" name="visibility" value="public" checked>公开</label><label><input type="radio" name="visibility" value="private">仅自己可见</label></div><button id="publish">发布</button><button>重新上传</button>';
   ${options.editorMarker?`const editor=document.querySelector('[contenteditable]'),marker=${JSON.stringify(options.editorMarker)};editor.dataset.modelText='';editor.prepend(document.createTextNode(marker));editor.addEventListener('input',()=>{const value=editor.innerText;editor.dataset.modelText=editor.textContent===''?'':value;editor.replaceChildren(document.createTextNode(marker+value));});`:''}
   document.querySelector('#publish').onclick=async()=>{const body={title:document.querySelector('input[maxlength]').value,description:${options.editorMarker?"document.querySelector('[contenteditable]').dataset.modelText":"document.querySelector('[contenteditable]').innerText"},visibility:document.querySelector('input[name=visibility]:checked')?.value||'public'};await fetch('/web/api/media/aweme/create/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());await window.__fixtureResponseReads();location.href='/creator-micro/content/manage';};};
  </script>`;
  if(path==='/creator-micro/content/upload'){
   state.uploadVisits++;
   if((options.delayInitial&&state.uploadVisits===1)||(options.delayReturn&&state.uploadVisits===2))body+=`<script>const pendingFile=document.querySelector('#file');pendingFile.remove();setTimeout(()=>{document.body.append(pendingFile);${options.draftAfterDelay?`document.querySelector('#form').innerHTML='<div contenteditable="true">既有草稿不可覆盖</div>';`:''}},500);</script>`;
  }
  if(path==='/creator-micro/content/manage'){
   const cover=options.cssCover?'<div style="width:100px;height:100px;background:#ccc"></div>':'<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" width=100 height=100>';
   const status=options.receiptStatus==='other_row'?'':`<span${options.receiptStatus==='hidden'?' style="display:none"':''}>已发布</span>`;
   const row=`<article style="height:200px">${cover}<a target="_blank" href="https://www.douyin.com/user/self?modal_id=${state.workId}">${state.caption}</a>${status}</article>`;
   body='<h1>内容管理</h1>'+(!state.publications?'':options.receiptStatus==='other_row'?`<section style="height:1000px">${row}<article><span>其他作品</span><span>已发布</span></article></section>`:row);
  }
  if(path==='/creator-micro/content/manage'){
   if(options.duplicateMenu)body='<nav>内容管理</nav>'+body;
   const listStatus='<button>作品 ('+(state.publications|| (options.existingCaption?1:0))+')</button>'+(options.existingCaption?'<p>'+options.existingCaption+'</p>':'');
   if(options.delayList)body+='<div id="loaded-list"></div><script>setTimeout(()=>{document.querySelector("#loaded-list").innerHTML='+JSON.stringify(listStatus)+';},500);</script>';
   else body+=listStatus;
  }
  return route.fulfill({contentType:'text/html; charset=utf-8',body});
 });
 await page.goto('https://creator.douyin.com/creator-micro/home');
 return{browser,context,page,state,adapter:new Adapter(),close:()=>browser.close()};
}
module.exports={createPrivatePublishFixture};
