import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { existsSync } from 'node:fs';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { CREATOR_URL, observeIdentity } from './douyin.js';
import { id } from '../validation.js';
import type { Repository } from '../storage/repository.js';
import type { Identity, LoginObservation } from '../../shared/desktop-contracts.js';

export function findBrowser(): string {
  const candidates = process.platform === 'win32' ? [
    ...['PROGRAMFILES','PROGRAMFILES(X86)','LOCALAPPDATA'].flatMap(key => process.env[key] ? [join(process.env[key]!, 'Microsoft/Edge/Application/msedge.exe'), join(process.env[key]!, 'Google/Chrome/Application/chrome.exe')] : []),
  ] : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] : ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'];
  const executable = candidates.find(path => existsSync(path));
  if (!executable) throw new Error('未找到 Chrome 或 Edge，请安装浏览器后重试。'); return executable;
}
type Dependencies = { launch?: (profile: string) => Promise<BrowserContext>; observe?: (page: Page) => Promise<Identity | null> };
export class SessionManager {
  private contexts = new Map<string, BrowserContext>();
  private opening = new Map<string, Promise<LoginObservation>>();
  private disposed = false;
  constructor(private profileRoot: string, private repository: Repository, private dependencies: Dependencies = {}) {
    for (const account of repository.snapshot().accounts) {
      const prior = repository.getConnection(account.id);
      if (prior.status === 'opening' || prior.status === 'logged_in') repository.recordConnection({ ...prior, status: 'pending_confirmation', reason: '应用已重新启动，请打开官方页面重新核实账号。' });
    }
  }
  open(accountId: string): Promise<LoginObservation> {
    id(accountId); if (!this.repository.getAccount(accountId)) return Promise.reject(new Error('账号不存在'));
    if (this.disposed) return Promise.reject(new Error('应用正在关闭'));
    const existing = this.opening.get(accountId); if (existing) return existing;
    const work = this.openInternal(accountId).finally(() => this.opening.delete(accountId));
    this.opening.set(accountId, work); return work;
  }
  private async openInternal(accountId: string): Promise<LoginObservation> {
    const active = this.contexts.get(accountId);
    if (active) { await active.pages()[0]?.bringToFront(); return this.refresh(accountId); }
    const previous = this.repository.getConnection(accountId);
    this.repository.recordConnection({ ...previous, status:'opening' });
    try {
      await mkdir(this.profileRoot,{recursive:true}); const profile=join(this.profileRoot,accountId); await mkdir(profile,{recursive:true});
      if ((await lstat(profile)).isSymbolicLink() || !(await realpath(profile)).startsWith((await realpath(this.profileRoot))+sep)) throw new Error('账号配置目录不安全');
      const context = await (this.dependencies.launch ? this.dependencies.launch(profile) : chromium.launchPersistentContext(profile,{ executablePath:findBrowser(),headless:false,viewport:null }));
      if (this.disposed) { await context.close(); throw new Error('应用正在关闭'); }
      this.contexts.set(accountId,context);
      context.once('close',()=>{ if(this.contexts.get(accountId)===context)this.contexts.delete(accountId);if(!this.disposed){try{const connection=this.repository.getConnection(accountId);this.repository.recordConnection({...connection,status:'pending_confirmation',reason:'浏览器已关闭，下次打开时重新核实账号。'});}catch{ /* repository may already be closed during shutdown */ }} });
      const page=context.pages()[0] || await context.newPage();page.setDefaultTimeout(5000);
      let navigationFailed=false;try{await page.goto(CREATOR_URL,{waitUntil:'domcontentloaded',timeout:20000});}catch{navigationFailed=true;}
      const observed=await this.refresh(accountId);
      if(navigationFailed&&observed.status!=='logged_in'){observed.reason='官方页面未完成加载，请在独立浏览器中检查网络并重试。';this.repository.recordConnection(observed);}
      return observed;
    } catch(error) {
      this.repository.recordConnection({...previous,status:'not_logged_in',reason:error instanceof Error?error.message:'浏览器启动失败'});throw error;
    }
  }
  async refresh(accountId: string): Promise<LoginObservation> {
    const prior=this.repository.getConnection(id(accountId));const context=this.contexts.get(accountId);
    if(!context){
      if(prior.status==='opening'||prior.status==='logged_in'){
        const recovered:LoginObservation={...prior,status:'pending_confirmation',reason:'当前没有活动的登录浏览器，请重新打开并核实账号。'};
        this.repository.recordConnection(recovered);return recovered;
      }
      return prior;
    }
    const page=context.pages()[0];let identity:Identity|null=null;
    try{if(page)identity=await (this.dependencies.observe||observeIdentity)(page);}catch{identity=null;}
    let observation:LoginObservation={...prior,status:'pending_confirmation',reason:'登录浏览器已打开；身份识别尚未完成实机验证，请在官方页面确认账号。'};
    if(identity&&typeof identity.remoteId==='string'&&identity.remoteId&&identity.remoteId.length<=200&&typeof identity.displayName==='string'&&identity.displayName&&Number.isFinite(Date.parse(identity.observedAt))){
      const duplicate=this.repository.snapshot().accounts.find(a=>a.id!==accountId&&a.identity?.remoteId===identity.remoteId);
      if(prior.identity&&prior.identity.remoteId!==identity.remoteId)observation.reason='当前账号与之前绑定的身份不一致，请核对后重新登录。';
      else if(duplicate)observation.reason='该身份已绑定其他账号档案，请勿重复绑定。';
      else observation={accountId,status:'logged_in',identity};
    }
    this.repository.recordConnection(observation);return observation;
  }
  async close(accountId:string):Promise<void>{id(accountId);await this.opening.get(accountId)?.catch(()=>undefined);await this.contexts.get(accountId)?.close();}
  async closeAll():Promise<void>{this.disposed=true;await Promise.allSettled([...this.opening.values()]);await Promise.allSettled([...this.contexts.values()].map(context=>context.close()));this.contexts.clear();}
}
