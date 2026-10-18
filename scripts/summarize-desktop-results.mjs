import { readFile, appendFile } from 'node:fs/promises';

const clean=value=>String(value??'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\r\n?/g,'\n');
const message=value=>clean(value).slice(0,2000);
const annotation=value=>clean(value).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
const property=value=>annotation(value).replace(/:/g,'%3A').replace(/,/g,'%2C');
const markdown=value=>clean(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/`/g,'&#96;');
function location(spec){
 const path=String(spec.file??'').replace(/\\/g,'/'),index=path.lastIndexOf('tests-desktop/');
 const file=index>=0?path.slice(index):'';
 return file&&!file.split('/').includes('..')&&Number.isSafeInteger(spec.line)&&spec.line>0?`file=${property(file)},line=${spec.line},`:'';
}
function collect(suites,parent=[]){
 return suites.flatMap(suite=>[
  ...(suite.specs??[]).flatMap(spec=>(spec.tests??[]).map(test=>({spec,test,title:[...parent,suite.title,spec.title].filter(Boolean).join(' › ')}))),
  ...collect(suite.suites??[],[...parent,suite.title].filter(Boolean))
 ]);
}
async function publish(summary,commands){
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
 for(const command of commands)process.stdout.write(command+'\n');
}
async function main(){
 let report;
 try{report=JSON.parse(await readFile(process.argv[2]??'desktop-test-results/results.json','utf8'));}
 catch(error){
  const missing=error?.code==='ENOENT';
  await publish(`## Windows 桌面测试\n\n${missing?'未生成桌面测试报告，请检查前序构建或测试启动步骤。':'桌面测试报告无法解析，结果不可确认。'}`,[`::${missing?'warning':'error'}::${annotation(missing?'未生成桌面测试报告':'桌面测试报告无法解析')}`]);
  if(!missing)process.exitCode=1;
  return;
 }
 if(!Array.isArray(report.suites)||!Array.isArray(report.errors??[]))throw new Error('桌面测试报告结构无效');
 const entries=collect(report.suites),failures=entries.filter(({test})=>test.status==='unexpected'),flaky=entries.filter(({test})=>test.status==='flaky').length;
 const passed=entries.filter(({test})=>test.status==='expected'&&test.expectedStatus==='passed'&&test.results?.at(-1)?.status==='passed').length;
 const skipped=entries.filter(({test})=>test.status==='skipped').length;
 const expectedFailures=entries.filter(({test})=>test.status==='expected'&&test.expectedStatus==='failed').length;
 const errors=report.errors??[],commands=[];
 let summary=`## Windows 桌面测试\n\n通过：${passed} · 失败：${failures.length} · 跳过：${skipped} · 不稳定：${flaky} · 预期失败：${expectedFailures} · 运行器错误：${errors.length}\n`;
 if(!entries.length)summary+='\n没有执行任何桌面用例，不能据此判定通过。\n';
 for(const{spec,test,title}of failures){
  const result=test.results?.at(-1),detail=message(result?.error?.message??result?.errors?.[0]?.message??result?.status??'未提供详细错误');
  summary+=`\n### ${markdown(title)}\n\n<pre>${markdown(detail)}</pre>\n`;
  commands.push(`::error ${location(spec)}title=${property(title.slice(0,200))}::${annotation(detail)}`);
 }
 for(const error of errors){const detail=message(error.message??'未提供运行器错误');summary+=`\n<pre>${markdown(detail)}</pre>\n`;commands.push(`::error::${annotation(detail)}`);}
 await publish(summary,commands);
}
await main().catch(async error=>{process.stderr.write(message(error.message)+'\n');process.exitCode=1;});
