import{expect,type ElectronApplication}from'@playwright/test';
export async function seedComments(app:ElectronApplication,count=2){
 const page=await app.firstWindow();await expect(page.getByRole('heading',{name:'让创作，井井有条。'})).toBeVisible();
 return app.evaluate(async({app},count)=>{
  const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json'),p=require('node:path');const{Repository}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js'));const repo=new Repository(app.getPath('userData'));repo.initialize();
  try{const accounts=Array.from({length:count},(_,i)=>repo.createAccount({name:'评论测试账号'+(i+1),group:'本地测试'}));for(const a of accounts){repo.comments.startSync(a.id);repo.comments.completeSync(a.id,'test-owner-'+a.id,[{ownerRemoteId:'test-owner-'+a.id,remoteWorkId:'same-work',remoteThreadId:'same-thread',remoteCommentId:'same-comment',authorRemoteId:'same-author-id',authorName:'同名评论者',text:'本地测试评论，不来自真实账号。',remoteCreatedAt:'2026-10-18T00:00:00.000Z',observedAt:new Date().toISOString(),availability:'present'}],null,'end');}return{accounts,comments:repo.comments.list({offset:0,limit:100}).comments};}
  finally{repo.close();}
 },count);
}
export function commentApi(page:any){return{getCommentDetails:(id:string)=>page.evaluate((id:string)=>window.xumu!.getCommentDetails(id),id),saveCommentDraft:(input:any)=>page.evaluate((input:any)=>window.xumu!.saveCommentDraft(input),input)};}
