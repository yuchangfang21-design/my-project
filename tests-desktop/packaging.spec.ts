import { _electron, test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('packaged application resolves preload, renderer and native database without a source server',async()=>{
  const executable=resolve(process.platform==='win32'?'release/win-unpacked/xumu-workspace.exe':'release/linux-unpacked/xumu-workspace');
  expect(existsSync(executable),'packaged executable must exist before installation acceptance').toBeTruthy();
  const dataDir=await mkdtemp(join(tmpdir(),'序幕 packaged '));
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  try{
    for(let i=0;i<2;i++){
      const app=await _electron.launch({executablePath:executable,args:[...(process.platform==='linux'?['--no-sandbox']:[]),`--user-data-dir=${dataDir}`],env});
      try{const page=await app.firstWindow();await expect(page.getByRole('heading',{name:'让创作，井井有条。'})).toBeVisible();expect(await app.evaluate(({app})=>app.isPackaged)).toBe(true);const snapshot=await page.evaluate(()=>(window as any).xumu.getSnapshot());expect(snapshot.accounts).toHaveLength(i);if(i===0)await page.evaluate(()=>(window as any).xumu.createAccount({name:'打包持久化',group:'门店'}));expect(await app.evaluate(({app})=>app.getPath('userData'))).toBe(dataDir);}
      finally{await app.close();}
    }
  }finally{await rm(dataDir,{recursive:true,force:true});}
});
