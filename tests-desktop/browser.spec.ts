import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchDesktop } from './helpers';
test('browser profiles isolate cookies, deduplicate concurrent opens, and require identity evidence', async () => {
  const dir=await mkdtemp(join(tmpdir(),'xumu-browser-'));const app=await launchDesktop(dir);
  try {
    const result=await app.evaluate(async (_electron,root)=>{
      const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json');const p=require('node:path');
      const {Repository}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js'));
      const {SessionManager}=require(p.join(process.cwd(),'dist-desktop/desktop/browser/session-manager.js'));
      const {chromium}=require('playwright-core');const repo=new Repository(p.join(root,'sessions-db'));repo.initialize();
      const first=repo.createAccount({name:'账号一',group:'门店'}),second=repo.createAccount({name:'账号二',group:'门店'});
      const contexts:any[]=[];const profiles:string[]=[];let launches=0;let evidence:any=null;
      const manager=new SessionManager(p.join(root,'profiles'),repo,{launch:async(profile:string)=>{launches++;profiles.push(profile);const ctx=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.platform==='linux'?'/usr/bin/chromium':undefined,channel:process.platform==='win32'?'msedge':undefined,args:process.platform==='linux'?['--no-sandbox']:[]});await ctx.route('https://creator.douyin.com/**',(route:any)=>route.fulfill({contentType:'text/html',body:'<h1>本地测试夹具，不是抖音登录</h1>'}));contexts.push(ctx);return ctx;},observe:async()=>evidence});
      try {
        const opened=await Promise.all([manager.open(first.id),manager.open(first.id)]);await manager.open(second.id);
        await contexts[0].addCookies([{name:'local-fixture',value:'a',domain:'creator.douyin.com',path:'/'}]);const isolated=(await contexts[1].cookies()).length===0;
        const noIdentity=opened.every((o:any)=>o.status==='pending_confirmation');const launchCount=launches;const distinct=new Set(profiles).size===2;
        await manager.close(first.id);await manager.close(second.id);
        evidence={remoteId:'fixture-id',displayName:'夹具账号',observedAt:new Date().toISOString()};const verified=await manager.open(first.id);await manager.close(first.id);
        evidence={remoteId:'different-id',displayName:'其他账号',observedAt:new Date().toISOString()};const mismatch=await manager.open(first.id);
        let invalid=false;try{await manager.open('../escape');}catch{invalid=true;}
        return{launchCount,isolated,noIdentity,distinct,verified:verified.status,mismatch:mismatch.status,retained:repo.getAccount(first.id).identity.remoteId,invalid};
      }finally{await manager.closeAll();repo.close();}
    },dir);
    expect(result).toMatchObject({launchCount:2,isolated:true,noIdentity:true,distinct:true,verified:'logged_in',mismatch:'pending_confirmation',retained:'fixture-id',invalid:true});
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('browser missing executable returns a useful failure without marking login success', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'xumu-missing-browser-'));const app=await launchDesktop(dir);
  try{const result=await app.evaluate(async(_electron,root)=>{
    const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json');const p=require('node:path');const{Repository}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js'));const{SessionManager}=require(p.join(process.cwd(),'dist-desktop/desktop/browser/session-manager.js'));const repo=new Repository(p.join(root,'missing-db'));repo.initialize();const account=repo.createAccount({name:'门店',group:'门店'});const manager=new SessionManager(p.join(root,'profiles'),repo,{launch:async()=>{throw new Error('未找到 Chrome 或 Edge，请安装浏览器');}});try{let reason='';try{await manager.open(account.id);}catch(error){reason=(error as Error).message;}return{reason,status:repo.getConnection(account.id).status};}finally{await manager.closeAll();repo.close();}
  },dir);expect(result.reason).toContain('Chrome 或 Edge');expect(result.status).not.toBe('logged_in');}finally{await app.close();await rm(dir,{recursive:true,force:true});}
});

test('restart persists recovery of interrupted opening and rechecks previously observed identity',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'xumu-login-recovery-'));let app=await launchDesktop(dir);
  try{
    await app.evaluate(async(_electron,root)=>{const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json');const p=require('node:path');const{Repository}=require(p.join(process.cwd(),'dist-desktop/desktop/storage/repository.js'));const repo=new Repository(root);repo.initialize();const account=repo.createAccount({name:'中断的账号',group:'门店'});repo.recordConnection({accountId:account.id,status:'opening'});const known=repo.createAccount({name:'曾核实的账号',group:'门店'});repo.recordConnection({accountId:known.id,status:'logged_in',identity:{remoteId:'fixture-known',displayName:'夹具身份',observedAt:new Date().toISOString()}});repo.close();},dir);
    await app.close();app=await launchDesktop(dir);const page=await app.firstWindow();const initial=await page.evaluate(()=>window.xumu!.getSnapshot());expect(initial.accounts.map(a=>a.loginStatus)).toEqual(['pending_confirmation','pending_confirmation']);expect(initial.accounts[1].identity?.remoteId).toBe('fixture-known');
    await page.evaluate(async()=>{const s=await window.xumu!.getSnapshot();await window.xumu!.getConnection(s.accounts[0].id);});expect((await page.evaluate(()=>window.xumu!.getSnapshot())).accounts[0].loginStatus).toBe('pending_confirmation');
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
