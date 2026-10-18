import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script=resolve('scripts/summarize-desktop-results.mjs');
async function run(report){
 const folder=await mkdtemp(join(tmpdir(),'xumu-ci-summary-'));
 try{
  const input=join(folder,'results.json'),summary=join(folder,'summary.md');
  if(report!==undefined)await writeFile(input,JSON.stringify(report));
  const result=spawnSync(process.execPath,[script,input],{encoding:'utf8',env:{...process.env,GITHUB_STEP_SUMMARY:summary}});
  return{status:result.status,stdout:result.stdout,stderr:result.stderr,summary:await readFile(summary,'utf8').catch(()=> '')};
 }finally{await rm(folder,{recursive:true,force:true});}
}
function report(tests=[],errors=[]){return{stats:{expected:tests.filter(t=>t.status==='expected').length,unexpected:tests.filter(t=>t.status==='unexpected').length,flaky:0,skipped:tests.filter(t=>t.status==='skipped').length},suites:[{title:'comments-ui.spec.ts',specs:[{title:'评论详情键盘测试',file:'comments-ui.spec.ts',line:15,tests}]}],errors};}

test('CI exposes the actual Windows failure and source location without publishing attachments',async()=>{
 const output=await run(report([{projectName:'windows',status:'unexpected',expectedStatus:'passed',results:[{status:'failed',error:{message:'Expected: 0\nReceived: 1'},attachments:[{name:'private attachment',body:'NEVER_PRINT_ATTACHMENT'}]}]}]));
 assert.equal(output.status,0,output.stderr);assert.match(output.stdout,/::error file=tests-desktop\/comments-ui.spec.ts,line=15/);assert.match(output.stdout,/Expected: 0%0AReceived: 1/);assert.match(output.summary,/评论详情键盘测试/);assert.match(output.summary,/失败：1/);assert.doesNotMatch(output.stdout+output.summary,/NEVER_PRINT_ATTACHMENT/);
});
test('CI reports skipped tests separately from successful tests',async()=>{
 const output=await run(report([{status:'skipped',expectedStatus:'skipped',results:[{status:'skipped'}]}]));
 assert.equal(output.status,0,output.stderr);assert.match(output.summary,/通过：0/);assert.match(output.summary,/跳过：1/);assert.doesNotMatch(output.summary,/全部通过/);
});
test('CI escapes annotation commands and strips terminal colors',async()=>{
 const output=await run(report([{status:'unexpected',expectedStatus:'passed',results:[{status:'failed',error:{message:'\u001b[31m失败 100%\u001b[0m\n::warning::not-a-command'}}]}]));
 assert.equal(output.status,0,output.stderr);assert.equal(output.stdout.trim().split('\n').length,2);assert.match(output.stdout,/失败 100%25%0A::warning::not-a-command/);assert.doesNotMatch(output.stdout+output.summary,/\u001b/);
});
test('CI clearly reports a missing results file instead of claiming a zero-test success',async()=>{
 const output=await run(undefined);assert.equal(output.status,0,output.stderr);assert.match(output.summary,/未生成桌面测试报告/);assert.match(output.stdout,/::warning::/);assert.doesNotMatch(output.summary,/全部通过/);
});
test('CI includes runner-level errors when no individual test started',async()=>{
 const output=await run(report([],[{message:'Electron runner crashed before tests'}]));assert.equal(output.status,0,output.stderr);assert.match(output.stdout,/::error/);assert.match(output.summary,/Electron runner crashed before tests/);assert.match(output.summary,/运行器错误：1/);assert.doesNotMatch(output.summary,/全部通过/);
});

test('CI maps absolute Windows source locations back into the repository',async()=>{
 const input=report([{status:'unexpected',expectedStatus:'passed',results:[{status:'failed',error:{message:'Windows-specific failure'}}]}]);input.suites[0].specs[0].file='D:\\a\\my-project\\my-project\\tests-desktop\\comments-ui.spec.ts';
 const output=await run(input);assert.equal(output.status,0,output.stderr);assert.match(output.stdout,/::error file=tests-desktop\/comments-ui.spec.ts,line=15/);assert.doesNotMatch(output.stdout,/D:/);
});
test('CI never annotates a source location outside the desktop test directory',async()=>{
 const input=report([{status:'unexpected',expectedStatus:'passed',results:[{status:'failed',error:{message:'Rejected location'}}]}]);input.suites[0].specs[0].file='../private.txt';
 const output=await run(input);assert.equal(output.status,0,output.stderr);assert.doesNotMatch(output.stdout,/file=/);assert.match(output.stdout,/::error title=/);
});

test('CI exposes complete totals even when GitHub limits per-step error annotations',async()=>{
 const input=report(Array.from({length:12},()=>({status:'unexpected',expectedStatus:'passed',results:[{status:'failed',error:{message:'Fixture failure'}}]})));
 const output=await run(input);assert.equal(output.status,0,output.stderr);assert.match(output.stdout,/::notice title=Desktop test totals::通过：0 · 失败：12 · 跳过：0/);assert.match(output.summary,/失败：12/);
});
