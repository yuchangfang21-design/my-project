import type{Page,Response,Request,Locator}from'playwright-core';
import{observeIdentity}from'../browser/douyin.js';
import type{Identity}from'../../shared/desktop-contracts.js';
import type{PublicationReceipt}from'../../shared/publishing-contracts.js';
import type{AttemptRecord}from'../storage/publish-store.js';
import type{PublishAdapter,PublishObservation,PreparePublicationInput}from'./adapter.js';
import{verifiedWorkUrl}from'./work-url.js';
import{PublishAdapterError}from'./adapter-error.js';
import type{ReceiptDiagnosticCode}from'./receipt-diagnostic.js';
const UPLOAD='https://creator.douyin.com/creator-micro/content/upload',WORKS='https://creator.douyin.com/creator-micro/content/manage';
const VERSION='douyin-private-ui-v4';
type Prepared={attemptId:string;identity:Identity;title:string;description:string;submitted:boolean;ids:Set<string>;requests:Set<Promise<void>>;captureReason?:ReceiptDiagnosticCode};
function official(page:Page):boolean{try{const u=new URL(page.url());return u.origin==='https://creator.douyin.com'&&u.pathname.startsWith('/creator-micro/');}catch{return false;}}
function exactId(value:unknown):string|null{return typeof value==='string'&&/^[1-9]\d{0,29}$/.test(value)?value:null;}
function responseWorkId(body:string):string|null{
 const numbers=new WeakMap<object,Map<string,string>>();
 const json=JSON.parse(body,function(this:object,key,value,context?:{source?:string}){if(typeof value==='number'&&context?.source){let fields=numbers.get(this);if(!fields){fields=new Map();numbers.set(this,fields);}fields.set(key,context.source);}return value;});
 if(!json||typeof json!=='object'||(json.status_code!==0&&json.message!=='success')||(json.status_code!==undefined&&json.status_code!==0)||(json.message!==undefined&&json.message!=='success'))return null;
 const ids:string[]=[];
 for(const object of[json,json.data,json.aweme,json.data?.aweme]){
  if(!object||typeof object!=='object'||Array.isArray(object))continue;
  for(const key of['aweme_id','item_id'])if(Object.hasOwn(object,key)){
   const raw=object[key],id=exactId(typeof raw==='number'?numbers.get(object)?.get(key)??(Number.isSafeInteger(raw)?String(raw):null):raw);if(!id)return null;ids.push(id);
  }
 }
 return ids.length&&new Set(ids).size===1?ids[0]:null;
}
// Rich editors may insert U+200B/BOM without changing visible copy. Only
// tolerate those in observed text when the requested copy contains neither.
function descriptionsMatch(actual:string,expected:string):boolean{
 const value=actual.replace(/\r\n/g,'\n').trimEnd();
 return value===expected||(!/[\u200B\uFEFF]/.test(expected)&&value.replace(/[\u200B\uFEFF]/g,'')===expected);
}
export class DouyinPrivatePublishAdapter implements PublishAdapter{
 readonly worksUrl=WORKS;
 constructor(readonly publicationMode:'private_test'|'site_default_test'='private_test'){}
 private get requiresPrivate():boolean{return this.publicationMode==='private_test';}
 private get version():string{return this.requiresPrivate?VERSION:'douyin-site-default-ui-v2';}
 private prepared=new WeakMap<Page,Prepared>();
 private diagnostics=new WeakMap<Page,ReceiptDiagnosticCode>();
 resultDiagnostic(page:Page):ReceiptDiagnosticCode|null{return this.diagnostics.get(page)||null;}
 private unknown(page:Page,code:ReceiptDiagnosticCode):null{this.diagnostics.set(page,code);return null;}
 private readiness=new WeakMap<Page,Identity>();
 private title(page:Page):Locator{return page.locator('input[placeholder*="标题"]:visible');}
 private description(page:Page):Locator{return page.locator('[contenteditable="true"]:visible');}
 private privacy(page:Page):Locator{return page.getByRole('radio',{name:'仅自己可见',exact:true});}
 private button(page:Page):Locator{return page.getByRole('button',{name:'发布',exact:true});}
 private async form(page:Page):Promise<boolean>{return await this.title(page).count()===1&&await this.description(page).count()===1&&(!this.requiresPrivate||await this.privacy(page).count()===1)&&await this.button(page).count()===1;}
 private async uploadReady(page:Page):Promise<void>{
  const expectedUrl=page.url();
  const sameUpload=()=>official(page)&&page.url()===expectedUrl&&new URL(page.url()).pathname==='/creator-micro/content/upload';
  if(!sameUpload())throw new PublishAdapterError('PRIVATE_UPLOAD_NOT_READY','未处于官方视频上传页；本次未提交');
  try{await page.locator('input[type="file"]').first().waitFor({state:'attached',timeout:10000});}
  catch{throw new PublishAdapterError('PRIVATE_UPLOAD_NOT_READY','上传控件在10秒内未就绪，请保持官方上传页；本次未提交');}
  if(!sameUpload())throw new PublishAdapterError('PRIVATE_UPLOAD_NOT_READY','等待上传控件时页面已变化；本次未提交');
  if(await this.description(page).count())throw new PublishAdapterError('PRIVATE_DRAFT_PRESENT','官方上传页已有编辑内容，请先在官网核对草稿；本次未覆盖或提交');
  if(await page.locator('input[type="file"]').count()!==1)throw new PublishAdapterError('PRIVATE_UPLOAD_NOT_READY','官网存在多个上传控件，无法唯一定位视频；本次未提交');
 }
 private async openWorks(page:Page):Promise<void>{
  try{
   await page.goto(WORKS,{waitUntil:'domcontentloaded',timeout:10000});
   const expectedUrl=page.url();
   if(!official(page)||new URL(expectedUrl).pathname!=='/creator-micro/content/manage')throw new Error('Unexpected works page');
   // The navigation and page title share 内容管理. Read the loaded work-count
   // indicator instead; this is a read-only readiness check, never a click target.
   await page.getByText(/^作品\s*[（(]\s*\d+\s*[）)]$/).filter({visible:true}).first().waitFor({timeout:5000});
   if(page.url()!==expectedUrl)throw new Error('Works page changed');
  }catch{throw new PublishAdapterError('PRIVATE_WORKS_NOT_READY','官方作品列表未就绪，已停止重复文案检查；尚未上传或点击发布');}
 }
 private async matches(page:Page,state:Prepared):Promise<boolean>{
  if(!official(page)||!await this.form(page))return false;
  return await this.title(page).inputValue()===state.title&&descriptionsMatch(await this.description(page).innerText(),state.description)&&(!this.requiresPrivate||await this.privacy(page).isChecked());
 }
 async observe(page:Page):Promise<PublishObservation>{
  const no=(reason:string,identity:Identity|null=null):PublishObservation=>({identity,canPublish:false,publicationMode:this.publicationMode,version:this.version,reason});
  if(!official(page))return no('请在该账号的官方创作者工作区打开发布页');
  let identity=await observeIdentity(page);if(!identity)return no('当前账号身份未核实');
  const state=this.prepared.get(page);
  if(state){
   if(identity.remoteId!==state.identity.remoteId)return no('当前账号已变化，请重新核对',identity);
   if(!state.submitted&&!await this.matches(page,state))return no('文案或已核对设置已变化，请重新核对',identity);
   return{identity,canPublish:true,publicationMode:this.publicationMode,version:this.version};
  }
  try{
   if(new URL(page.url()).pathname!=='/creator-micro/content/upload'){
    const prior=identity.remoteId;await page.goto(UPLOAD,{waitUntil:'domcontentloaded',timeout:10000});identity=await observeIdentity(page);
    if(!identity||identity.remoteId!==prior)return no('打开发布页后账号身份发生变化',identity);
   }
   await this.uploadReady(page);
   this.readiness.set(page,identity);return{identity,canPublish:true,publicationMode:this.publicationMode,version:this.version};
  }catch(error){return no(error instanceof PublishAdapterError?error.message:'无法读取官方上传页，请检查账号窗口后重新核对',identity);}
 }
 async prepare(page:Page,input:PreparePublicationInput,signal:AbortSignal):Promise<void>{
  if(signal.aborted)throw new PublishAdapterError('PRIVATE_FORM_UNSUPPORTED','准备已取消');
  if(!input.attemptId||!input.title.trim()||input.title.length>30||input.description.length>1000||input.description!==input.description.trimEnd()||input.tags.length)throw new PublishAdapterError('PRIVATE_COPY_UNSUPPORTED','单视频联调只支持30字内标题、1000字内正文和无标签的单视频');
  const prior=this.readiness.get(page);if(!prior)throw new PublishAdapterError('PRIVATE_FORM_UNSUPPORTED','请先完成发布前核对');
  if(this.prepared.get(page)?.attemptId===input.attemptId)throw new PublishAdapterError('PRIVATE_FORM_UNSUPPORTED','同一次尝试不能重复上传');
  const abort=()=>{void page.context().close().catch(()=>undefined);};signal.addEventListener('abort',abort,{once:true});
  try{
   await this.openWorks(page);
   const caption=[input.title,input.description].filter(Boolean).join(' ');
   if(await page.getByText(caption,{exact:true}).count())throw new PublishAdapterError('PRIVATE_DUPLICATE_COPY','官方列表已有相同文案，请使用可唯一核对的新标题');
   await page.goto(UPLOAD,{waitUntil:'domcontentloaded',timeout:10000});
   await this.uploadReady(page);
   const identity=await observeIdentity(page);if(!identity||identity.remoteId!==prior.remoteId)throw new PublishAdapterError('LOGIN_REQUIRED','上传前账号身份已变化');
   if(signal.aborted)throw new PublishAdapterError('PRIVATE_FORM_UNSUPPORTED','准备已取消');
   await this.uploadReady(page);
   await page.locator('input[type="file"]').setInputFiles(input.file);
   await this.title(page).waitFor({state:'visible',timeout:120000});
   if(!await this.form(page))throw new PublishAdapterError('PRIVATE_EDITOR_UNSUPPORTED','编辑页控件无法唯一匹配，已停止');
   await this.title(page).fill(input.title);await this.description(page).fill(input.description);if(this.requiresPrivate)await this.privacy(page).check();
   const state:Prepared={attemptId:input.attemptId,identity,title:input.title,description:input.description,submitted:false,ids:new Set(),requests:new Set()};
   if(signal.aborted||!await this.matches(page,state))throw new PublishAdapterError('PRIVATE_READBACK_FAILED','已核对内容未通过回读校验');
   this.diagnostics.delete(page);this.prepared.set(page,state);
  }finally{signal.removeEventListener('abort',abort);}
 }
 private async capture(response:Response,state:Prepared,witnesses:Set<Request>):Promise<void>{
  try{
   const request=response.request(),url=new URL(response.url());
   if(request.method()!=='POST'||!['fetch','xhr'].includes(request.resourceType())||!witnesses.has(request)||url.origin!=='https://creator.douyin.com'||!/^\/web\/api\/(?:v\d+\/)?media\/aweme\/(?:create|publish)\/?$/.test(url.pathname))return;
   state.captureReason='RECEIPT_RESPONSE_UNSUPPORTED';
   if(!response.ok()||!/application\/json/i.test(response.headers()['content-type']||''))return;
   state.captureReason='RECEIPT_RESPONSE_SIZE';
   const declared=Number(response.headers()['content-length']);if(!Number.isSafeInteger(declared)||declared<=0||declared>65536)return;
   state.captureReason='RECEIPT_RESPONSE_UNREADABLE';
   const body=await response.body();if(body.byteLength>65536){state.captureReason='RECEIPT_RESPONSE_SIZE';return;}
   state.captureReason='RECEIPT_ID_UNSUPPORTED';
   const id=responseWorkId(body.toString('utf8'));if(id)state.ids.add(id);
  }catch{/* Retain only the static failing stage, never the response or error. */}
 }
 async submit(page:Page):Promise<PublicationReceipt|null>{
  const state=this.prepared.get(page);if(!state||state.submitted)throw new PublishAdapterError('PRIVATE_ALREADY_SUBMITTED','没有就绪尝试或该尝试已经提交');
  const identity=await observeIdentity(page);if(!identity||identity.remoteId!==state.identity.remoteId||!await this.matches(page,state))throw new PublishAdapterError('PRIVATE_COPY_CHANGED','提交前账号或已核对内容已变化');
  const button=this.button(page);await button.scrollIntoViewIfNeeded();
  const witnesses=new Set<Request>(),onRequest=(request:Request)=>{try{if(request.frame()===page.mainFrame())witnesses.add(request);}catch{/* Service-worker or other-frame requests cannot prove this submission. */}};
  const listener=(response:Response)=>{const work=this.capture(response,state,witnesses);state.requests.add(work);void work.finally(()=>state.requests.delete(work));};
  page.on('request',onRequest);page.on('response',listener);state.submitted=true;
  try{
   const title=await this.title(page).elementHandle(),description=await this.description(page).elementHandle(),privacy=this.requiresPrivate?await this.privacy(page).elementHandle():null,expectedUrl=page.url();
   await button.evaluate((element,args)=>{
    const b=element as HTMLButtonElement,t=args.title as HTMLInputElement,d=args.description as HTMLElement,p=args.privacy as HTMLElement;
    const visible=(node:Element)=>node.isConnected&&node.ownerDocument===document&&!!node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden';
    const unique=(selector:string,node:Element)=>[...document.querySelectorAll(selector)].filter(visible).length===1&&[...document.querySelectorAll(selector)].filter(visible)[0]===node;
    const radios=args.requirePrivate?[...document.querySelectorAll('input[type="radio"],[role="radio"]')].filter(visible).filter(node=>{
     const label=node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ')||(node instanceof HTMLInputElement?[...(node.labels||[])].map(l=>l.textContent||'').join(' '):node.textContent)||'';
     return label.trim()==='仅自己可见';
    }):[];
    if(!t||!d||!visible(b)||!unique('input[placeholder*="标题"]',t)||!unique('[contenteditable="true"]',d)||(args.requirePrivate&&(!p||radios.length!==1||radios[0]!==p)))throw new Error('发布表单已替换，已停止');
    // Same narrow comparison as descriptionsMatch, inside the atomic click.
    const body=d.innerText.replace(/\r\n/g,'\n').trimEnd();
    const copyMatches=body===args.expectedDescription||(!/[\u200B\uFEFF]/.test(args.expectedDescription)&&body.replace(/[\u200B\uFEFF]/g,'')===args.expectedDescription);
    const rect=b.getBoundingClientRect(),top=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    if(location.href!==args.expectedUrl||!t||t.value!==args.expectedTitle||!d||!copyMatches||(args.requirePrivate&&(!p||!(p instanceof HTMLInputElement?p.checked:p.getAttribute('aria-checked')==='true')))||b.disabled||b.getAttribute('aria-disabled')==='true'||!rect.width||!rect.height||!top||!b.contains(top))throw new Error('提交控件或核对内容已变化');
    b.click();
   },{title,description,privacy,requirePrivate:this.requiresPrivate,expectedUrl,expectedTitle:state.title,expectedDescription:state.description});
   this.diagnostics.set(page,'RECEIPT_PAGE_UNMATCHED');
   await page.waitForURL(url=>url.origin==='https://creator.douyin.com'&&url.pathname==='/creator-micro/content/manage',{timeout:15000});
   await Promise.all([...state.requests]);return await this.receipt(page,state);
  }finally{page.off('request',onRequest);page.off('response',listener);}
 }
 private async receipt(page:Page,state:Prepared):Promise<PublicationReceipt|null>{
  if(!official(page)||new URL(page.url()).pathname!=='/creator-micro/content/manage')return this.unknown(page,'RECEIPT_PAGE_UNMATCHED');
  if(!state.ids.size)return this.unknown(page,state.captureReason||'RECEIPT_RESPONSE_UNSEEN');
  if(state.ids.size!==1)return this.unknown(page,'RECEIPT_ID_CONFLICT');
  this.diagnostics.set(page,'RECEIPT_CAPTION_UNMATCHED');
  const caption=[state.title,state.description].filter(Boolean).join(' '),link=page.getByText(caption,{exact:true});if(await link.count()!==1)return null;
  this.diagnostics.set(page,'RECEIPT_STATUS_UNMATCHED');
  const published=await link.evaluate(element=>{
   for(let parent=element.parentElement,depth=0;parent&&depth<7;parent=parent.parentElement,depth++){
    if(parent.getBoundingClientRect().height>420)break;
    // Creator covers may be CSS backgrounds; publication is established by
    // the nearby visible status, captured work ID, detail URL and live owner.
    if([...parent.querySelectorAll('*')].some(node=>!node.children.length&&node.textContent?.trim()==='已发布'&&!!node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'))return true;
   }return false;
  });if(!published)return null;
  this.diagnostics.set(page,'RECEIPT_LINK_UNMATCHED');
  const id=[...state.ids][0];let href=await link.getAttribute('href');
  if(!href){
   const [popup]=await Promise.all([page.waitForEvent('popup',{timeout:5000}),link.click()]);
   try{await popup.waitForURL(url=>url.hostname==='www.douyin.com'&&url.pathname==='/user/self',{timeout:5000});href=popup.url();}finally{await popup.close();}
  }
  let url:URL;try{url=verifiedWorkUrl(new URL(href!,page.url()).href,id);}catch{return null;}if(url.hostname!=='www.douyin.com')return null;
  this.diagnostics.set(page,'RECEIPT_OWNER_UNMATCHED');
  const identity=await observeIdentity(page);if(!identity||identity.remoteId!==state.identity.remoteId)return null;
  this.diagnostics.delete(page);
  return{remoteWorkId:id,accountRemoteId:identity.remoteId,officialUrl:url.href,state:'published',observedAt:new Date().toISOString()};
 }
 async readResult(page:Page,attempt:AttemptRecord):Promise<PublicationReceipt|null>{
  const state=this.prepared.get(page);
  if(!state?.submitted)return this.unknown(page,'RECEIPT_STATE_MISSING');
  if(state.attemptId!==attempt.id||attempt.adapterVersion!==this.version||attempt.snapshot.publicationMode!==this.publicationMode||state.identity.remoteId!==attempt.targetRemoteId||state.title!==attempt.snapshot.title||state.description!==attempt.snapshot.description)return this.unknown(page,'RECEIPT_ATTEMPT_MISMATCH');
  return this.receipt(page,state);
 }
}

// Production follows the official visibility without reading or changing it.
export class DouyinDefaultPublishAdapter extends DouyinPrivatePublishAdapter {
 constructor(){super('site_default_test');}
}
