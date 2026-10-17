import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchDesktop } from './helpers';
test('desktop window uses isolated preload and restarts without a source server', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xumu-window-'));
  try {
    for (let i = 0; i < 2; i++) {
      const app = await launchDesktop(dir);
      try {
        const page = await app.firstWindow();
        await expect(page.getByRole('heading', { name: /序幕|让创作/ })).toBeVisible();
        expect(await page.evaluate(() => typeof (window as any).require)).toBe('undefined');
        expect(await page.evaluate(() => (window as any).xumu.getRuntime())).toMatchObject({ mode: 'desktop' });
        expect(await app.evaluate(({ BrowserWindow }) => { const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox }; })).toEqual({ contextIsolation: true, nodeIntegration: false, sandbox: true });
      } finally { await app.close(); }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a second process using the same data directory exits without touching the active workspace',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'xumu-instance-'));const app=await launchDesktop(dir);
  try{
    const page=await app.firstWindow();await page.evaluate(()=>window.xumu!.createAccount({name:'保留的账号',group:'门店'}));
    const exit=await app.evaluate(async()=>{const require=process.getBuiltinModule('module')!.createRequire(process.cwd()+'/package.json');const{spawn}=require('node:child_process');const p=require('node:path');return await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[...(process.platform==='linux'?['--no-sandbox']:[]),p.join(process.cwd(),'dist-desktop/desktop/main.js')],{env:process.env,stdio:'ignore'});const timer=setTimeout(()=>{child.kill();reject(new Error('第二个进程未退出'));},5000);child.once('error',(error:Error)=>{clearTimeout(timer);reject(error);});child.once('exit',(code:number)=>{clearTimeout(timer);resolve(code);});});});
    expect(exit).toBe(0);expect((await page.evaluate(()=>window.xumu!.getSnapshot())).accounts[0].name).toBe('保留的账号');
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
