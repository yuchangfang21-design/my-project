import{useCallback,useEffect,useId,useRef,useState,type ReactNode}from'react';
import{AlertTriangle,ArrowRight,CalendarDays,CheckCheck,FileVideo,LoaderCircle,Pause,Plus,Search,ShieldCheck,X}from'lucide-react';
import type{DesktopApi}from'../../shared/desktop-contracts';
import type{PublishBatch,PublishReview,PublishTaskDetails as Details,PublishStatus}from'../../shared/publishing-contracts';
import{usePublishing}from'./usePublishing';
import PublishReviewDialog from'./PublishReviewDialog';
import PublishTaskDetails from'./PublishTaskDetails';
import{publishLabels}from'./labels';
import{useDialog}from'./useDialog';

function Drawer({children,onClose}:{children:ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLElement>(null),id=useId();useDialog(ref,onClose);
 return <div className="pub-overlay pub-drawer-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="panel pub-drawer"><header className="pub-detail-heading"><h2 id={id}>任务详情</h2><button className="icon-button" aria-label="关闭任务详情" onClick={onClose}><X size={18}/></button></header>{children}</section></div>;
}
export default function DesktopPublishingPage({api,onChanged,onCreate,changeSignal,focusTask}:{api:DesktopApi;onChanged:()=>Promise<unknown>;onCreate:()=>void;changeSignal:unknown;focusTask:{id:string;request:number}|null}){
 const pub=usePublishing(api,onChanged),{snapshot}=pub;
 const[selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState(''),[filter,setFilter]=useState<'all'|PublishStatus>('all');
 const[selectedId,setSelectedId]=useState(''),[details,setDetails]=useState<Details|null>(null),[detailsOpen,setDetailsOpen]=useState(false),[detailError,setDetailError]=useState('');
 const[review,setReview]=useState<PublishReview|null>(null),[batches,setBatches]=useState<PublishBatch[]>([]),[batchError,setBatchError]=useState(''),[editorEpoch,setEditorEpoch]=useState(0),[narrow,setNarrow]=useState(()=>innerWidth<1200);
 const batchTicket=useRef(0),batchLive=useRef(true);
 const detailTicket=useRef(0),selectedRef=useRef(selectedId);selectedRef.current=selectedId;
 const refreshBatches=useCallback(async()=>{const ticket=++batchTicket.current;try{const next=await api.getPublishingBatches();if(batchLive.current&&ticket===batchTicket.current){setBatches(next);setBatchError('');}return next;}catch(error){if(batchLive.current&&ticket===batchTicket.current)setBatchError('无法读取批次状态，请重试');throw error;}},[api]);
 useEffect(()=>{batchLive.current=true;return()=>{batchLive.current=false;batchTicket.current++;};},[]);
 useEffect(()=>{void pub.refresh().catch(()=>undefined);void refreshBatches().catch(()=>undefined);},[changeSignal,pub.refresh,refreshBatches]);
 useEffect(()=>{const media=matchMedia('(max-width:1199px)'),update=()=>setNarrow(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{if(focusTask){setSelectedId(focusTask.id);setDetailsOpen(true);}},[focusTask]);
 useEffect(()=>{
  setSelected(ids=>ids.filter(id=>snapshot.tasks.some(t=>t.id===id)));
 },[snapshot.tasks]);
 useEffect(()=>{
  const ticket=++detailTicket.current;
  setDetails(current=>current?.task.id===selectedId?current:null);setDetailError('');
  if(selectedId)void api.getPublishTaskDetails(selectedId).then(next=>{if(ticket===detailTicket.current)setDetails(next);}).catch(error=>{if(ticket===detailTicket.current)setDetailError(String(error.message||error));});
  return()=>{detailTicket.current++;};
 },[api,selectedId,snapshot.tasks]);
 const runningKey=batches.filter(b=>b.state==='running').map(b=>b.id).join(',');
 useEffect(()=>{
  if(!runningKey)return;let live=true,polling=false;
  const timer=setInterval(()=>{if(polling)return;polling=true;void refreshBatches().then(()=>{if(live){void pub.refresh().catch(()=>undefined);void onChanged().catch(()=>undefined);}}).catch(()=>undefined).finally(()=>{polling=false;});},900);
  return()=>{live=false;clearInterval(timer);};
 },[runningKey,pub.refresh,onChanged,refreshBatches]);
 async function requestReview(ids=selected){const next=await pub.command(()=>api.reviewPublish({taskIds:ids}));if(next)setReview(next);}
 async function startReview(){if(!review)return;const reviewId=review.id;const next=await pub.command(()=>api.startPublish({reviewId}));if(next){batchTicket.current++;setBatches(list=>[next,...list.filter(b=>b.id!==next.id)]);setReview(current=>current?.id===reviewId?null:current);}}
 function selectTask(id:string){setSelectedId(id);setDetailsOpen(true);}
 async function reloadDetails(){const target=selectedId;const next=await pub.command(()=>api.getPublishTaskDetails(target));if(next&&selectedRef.current===target){setDetails(next);setEditorEpoch(n=>n+1);}}
 const tasks=snapshot.tasks.filter(task=>(filter==='all'||task.status===filter)&&(task.title+' '+snapshot.accounts.find(a=>a.id===task.accountId)?.name).includes(query.trim()));
 const eligible=tasks.filter(task=>!['submitted','published','rejected','cancelled'].includes(task.status)),allChecked=!!eligible.length&&eligible.every(task=>selected.includes(task.id));
 const pending=snapshot.tasks.filter(t=>['pending','waiting_login'].includes(t.status)).length,uncertain=snapshot.tasks.filter(t=>t.status==='review').length,submitted=snapshot.tasks.filter(t=>['submitted','published'].includes(t.status)).length;
 const detailContent=details?<PublishTaskDetails key={details.task.id+':'+editorEpoch} details={details} accountName={snapshot.accounts.find(a=>a.id===details.task.accountId)?.name||'账号档案'} filename={snapshot.assets.find(a=>a.id===details.task.assetId)?.filename||'素材信息不可用'} api={api} busy={pub.busy} batchRunning={batches.some(b=>b.state==='running'&&b.taskIds.includes(details.task.id))} run={pub.command} onReload={()=>void reloadDetails()} onReview={()=>void requestReview([details.task.id])} onSelect={selectTask}/>:<div className="pub-detail-empty">{detailError||<><FileVideo size={28}/><p>{selectedId?'正在读取任务详情…':'选择一条任务，查看内容与记录。'}</p></>}</div>;
 return <div className="publishing-page"><div className="page-heading publishing-heading"><div><div className="eyebrow"><span/>PUBLISHING STUDIO</div><h1>好内容，按你的节奏登场。</h1><p>先保存内容，再核对账号；每一次提交，都保留清晰的记录。</p></div><div className="pub-heading-actions"><button className="button secondary" disabled={pub.busy} onClick={onCreate}><Plus size={16}/>新建发布任务</button><button className="button primary" disabled={pub.busy||!selected.length} onClick={()=>void requestReview()}><ShieldCheck size={16}/>核对并启动{selected.length?'（'+selected.length+'）':''}</button></div></div>
 {(pub.error||batchError)&&<div className="pub-error" role="alert">{pub.error||batchError}<button className="text-button" onClick={()=>{pub.clearError();if(batchError)void refreshBatches().catch(()=>undefined);}}>收起提示 / 重试</button></div>}
 {(pub.loading||pub.busy)&&<div className="desktop-progress" role="status"><LoaderCircle size={14}/>{pub.loading?'正在读取发布任务…':'正在处理，请稍候…'}</div>}
 <div className="pub-summary"><div><CalendarDays size={20}/><strong>{pending}<small>条待执行 / 等待登录</small></strong></div><div><AlertTriangle size={20}/><strong>{uncertain}<small>条结果待核对</small></strong></div><div><CheckCheck size={20}/><strong>{submitted}<small>条已提交 / 已发布</small></strong></div><p>人工确认<br/><span>按就绪清单逐条执行</span></p></div>
 {(uncertain>0||batches.some(b=>b.state==='paused'))&&<div className="pub-pause-note"><AlertTriangle size={20}/><div><strong>{uncertain?'有结果需要先核对':'批次已暂停'}</strong><p>未开始的任务已保留。继续时需要重新核对，软件不会自动重发。</p></div></div>}
 {batches.filter(b=>b.state==='running').map(batch=><div className="pub-running-note" key={batch.id}><LoaderCircle size={17}/><span>正在逐条执行：{snapshot.tasks.find(t=>t.id===batch.taskIds[0])?.title||'已确认的发布清单'} · {batch.taskIds.length} 条任务</span><button className="button secondary small-button" disabled={pub.busy} onClick={()=>void pub.command(()=>api.pausePublishing(batch.id)).then(value=>{if(value){batchTicket.current++;setBatches(list=>list.map(item=>item.id===value.id?value:item));}})}><Pause size={14}/>暂停后续任务</button></div>)}
 <div className="desktop-publish-grid"><section className="panel pub-list-panel"><div className="pub-list-tools"><div className="pub-tabs">{([['all','全部'],['pending','待执行'],['waiting_login','等待登录'],['running','执行中'],['submitted','审核中'],['published','已发布'],['review','待核对'],['failed','失败'],['cancelled','已取消'],['rejected','受限']]as const).map(([value,label])=><button key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>)}</div><label className="pub-search"><Search size={14}/><input aria-label="搜索发布任务" placeholder="搜索标题或账号" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
 {!!selected.length&&<div className="pub-selection-note">已选择 {selected.length} 条任务，核对清单会列出全部所选内容。<button className="text-button" onClick={()=>setSelected([])}>清空选择</button></div>}
 <div className="pub-table-wrap"><table className="pub-table"><thead><tr><th className="pub-check-col"><input type="checkbox" aria-label="选择当前列表中的可选任务" checked={allChecked} disabled={!eligible.length} onChange={()=>setSelected(ids=>allChecked?ids.filter(id=>!eligible.some(t=>t.id===id)):Array.from(new Set([...ids,...eligible.map(t=>t.id)])))}/></th><th>作品与素材</th><th>目标账号</th><th>任务状态</th><th className="pub-action-col"><span className="pub-sr-only">操作</span></th></tr></thead><tbody>{tasks.map(task=><tr key={task.id} className={selectedId===task.id?'selected':''}><td><input type="checkbox" aria-label={'选择任务：'+task.title+' · '+(snapshot.accounts.find(a=>a.id===task.accountId)?.name||'账号')} checked={selected.includes(task.id)} disabled={['submitted','published','rejected','cancelled'].includes(task.status)} onChange={()=>setSelected(ids=>ids.includes(task.id)?ids.filter(id=>id!==task.id):[...ids,task.id])}/></td><td><strong>{task.title}</strong><small>{snapshot.assets.find(a=>a.id===task.assetId)?.filename||'素材不可用'}</small></td><td><span>{snapshot.accounts.find(a=>a.id===task.accountId)?.name||'账号档案'}</span><small>{snapshot.accounts.find(a=>a.id===task.accountId)?.identity?.displayName||'身份尚未核实'}</small></td><td><span className={'pub-status '+task.status}>{publishLabels[task.status]}</span></td><td><button className="icon-button" aria-label={'查看任务：'+task.title} onClick={()=>selectTask(task.id)}><ArrowRight size={17}/></button></td></tr>)}</tbody></table></div>
 {!tasks.length&&<div className="pub-empty"><FileVideo size={30}/><h2>{snapshot.tasks.length?'没有匹配的任务':'先为下一条内容做好准备'}</h2><p>{snapshot.tasks.length?'试试其他筛选条件或关键词。':'导入视频、选择账号，建立本地发布任务。'}</p>{!snapshot.tasks.length&&<button className="button secondary" onClick={onCreate}>新建发布任务</button>}</div>}
 <div className="pub-list-footer"><ShieldCheck size={14}/>能力尚未验证的账号不能发布；上传完成不等于已发布。</div></section>
 {!narrow&&<aside className="panel pub-details-panel" aria-label="任务详情"><header className="pub-detail-heading"><h2>任务详情</h2><span>本机记录</span></header>{detailContent}</aside>}
 </div>{narrow&&detailsOpen&&<Drawer onClose={()=>setDetailsOpen(false)}>{detailContent}</Drawer>}
 {review&&<PublishReviewDialog key={review.id} review={review} accounts={snapshot.accounts} busy={pub.busy} onClose={()=>setReview(null)} onStart={()=>void startReview()} onReload={()=>void requestReview(review.rows.map(row=>row.taskId))}/>}
 <div className="bottom-note"><ShieldCheck size={14}/>本地保存不会发布视频。未验证的站点能力保持不可用。</div></div>;
}
