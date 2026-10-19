import{useEffect,useId,useRef,useState}from'react';
import{ArrowRight,RefreshCw,ShieldCheck,X}from'lucide-react';
import type{DesktopAccount,DesktopAsset}from'../../shared/desktop-contracts';
import type{PublishReview}from'../../shared/publishing-contracts';
import{useDialog}from'./useDialog';
export default function PublishReviewDialog({review,accounts,assets,busy,onClose,onStart,onReload}:{review:PublishReview;accounts:DesktopAccount[];assets:DesktopAsset[];busy:boolean;onClose:()=>void;onStart:()=>void;onReload:()=>void}){
 const ref=useRef<HTMLElement>(null),heading=useId();useDialog(ref,onClose);
 const[ack,setAck]=useState(false),[now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const count=review.readyTaskIds.length,expired=now>=Date.parse(review.expiresAt);
 return <div className="pub-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} className="pub-review panel" role="dialog" aria-modal="true" aria-labelledby={heading}>
 <header className="pub-dialog-heading"><div><span className="pub-eyebrow">REVIEW & PUBLISH</span><h2 id={heading}>发布前核对</h2><p>本次 {review.rows.length} 条任务，{count} 条可继续，{review.rows.length-count} 条存在阻塞。</p></div><button className="icon-button" aria-label="关闭发布前核对" onClick={onClose}><X size={19}/></button></header>
 <div className="pub-review-list">{review.rows.map(row=><article className={'pub-review-item '+(row.blockers.length?'blocked':'ready')} key={row.taskId}><div className="pub-review-title"><strong>{accounts.find(a=>a.id===row.accountId)?.name||'账号档案'}</strong><span className={'pub-status '+(row.blockers.length?'review':'pending')}>{row.blockers.length?'暂不可执行':'可执行'}</span></div><p className="pub-identity">站点身份：{row.identity?row.identity.displayName+' · '+row.identity.remoteId:'尚未核实'}</p><dl>{row.publicationMode==='private_test'&&<><dt>可见范围</dt><dd><strong>仅自己可见 · 单视频联调</strong></dd></>}<dt>本机视频</dt><dd>{assets.find(asset=>asset.id===row.assetId)?.filename||'素材记录不可用'}</dd><dt>SHA-256</dt><dd>{row.assetSha256}</dd><dt>作品标题</dt><dd>{row.title}</dd><dt>完整说明</dt><dd className="pub-full-copy">{row.description||'未填写说明'}</dd><dt>标签</dt><dd>{row.tags.length?row.tags.map(tag=>'#'+tag).join(' '):'未填写标签'}</dd></dl>{!!row.blockers.length&&<ul className="pub-blockers">{row.blockers.map(blocker=><li key={blocker.code}>{blocker.message}</li>)}</ul>}</article>)}</div>
 <div className="pub-confirm-note"><ShieldCheck size={16}/><span>只执行已列出的就绪任务。被阻塞的任务不在本次确认范围内；修改内容、素材或账号后需重新核对。</span></div>
 <label className="pub-ack"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={!count||busy||expired}/>我已核对本次 {count} 条任务的账号和完整内容</label>
 {expired&&<p className="pub-inline-error" role="status">核对清单已过期，请重新生成。</p>}
 <footer className="pub-dialog-footer"><button className="button secondary" onClick={onReload} disabled={busy}><RefreshCw size={14}/>重新生成清单</button><button className="button primary" disabled={busy||!ack||!count||expired} onClick={onStart}>{count?'确认发布 '+count+' 条':'暂无可发布任务'}<ArrowRight size={15}/></button></footer>
 </section></div>;
}
