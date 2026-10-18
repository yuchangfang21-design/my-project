import DesktopCommentsPage from './comments/DesktopCommentsPage';
import type { CommentSummary } from '../shared/comments-contracts';
import type { CommentDraftController } from './comments/CommentDraftController';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clapperboard, Clock3, CloudOff, Coffee, Copy, Download, Ellipsis, ExternalLink, FileVideo, Filter, FolderOpen, Heart, LayoutDashboard, ListFilter, LoaderCircle, MessageCircle, MessageSquare, Monitor, Music2, Pause, Play, Plus, Search, Send, Settings2, ShieldCheck, Sparkles, Upload, Users, X } from 'lucide-react';
import { initialWorkspace, loadWorkspace, statusLabels, STORAGE_KEY, uid, type Account, type Asset, type Page, type Task, type Workspace } from './data';
import { coverImages } from './covers';
import type { DesktopApi } from '../shared/desktop-contracts';
import { demoGateway, desktopGateway } from './workspace/gateways';
import { useWorkspace } from './workspace/useWorkspace';
import DesktopSettings from './workspace/DesktopSettings';
import AccountSiteCheckDialog from './workspace/AccountSiteCheckDialog';
import type { AccountSiteCheck } from '../shared/site-check-contracts';
import DesktopPublishingPage from './publishing/DesktopPublishingPage';
import { publishLabels } from './publishing/labels';

type Modal = { type: 'site-check'; report: AccountSiteCheck } | { type: 'account' } | { type: 'asset'; asset: Asset } | { type: 'task'; assetId?: string } | { type: 'run' } | { type: 'info'; title: string; text: string } | { type: 'detail'; task: Task } | { type: 'reset' } | null;
const navItems = [
  { id: 'overview', label: '工作概览', icon: LayoutDashboard },
  { id: 'accounts', label: '账号管理', icon: Users },
  { id: 'assets', label: '素材库', icon: Clapperboard },
  { id: 'tasks', label: '发布任务', icon: CalendarDays },
  { id: 'messages', label: '消息中心', icon: MessageSquare },
] as const;
const pageLabels: Record<Page, string> = { overview: '工作概览', accounts: '账号管理', assets: '素材库', tasks: '发布任务', messages: '消息中心', settings: '工作区设置' };
const officialUrl = 'https://creator.douyin.com/';

function Avatar({ account, small = false }: { account: Account; small?: boolean }) {
  return <span className={`avatar ${account.color} ${small ? 'small' : ''}`} aria-hidden="true">{account.initial}<span className="douyin-mini"><Music2 size={9} /></span></span>;
}
function Badge({ status, desktop=false }: { status: Task['status']; desktop?:boolean }) { return <span className={`badge ${status}`}><span />{desktop&&status!=='demo_done'?publishLabels[status]:statusLabels[status]}</span>; }
function Cover({ asset, className = '' }: { asset?: Asset; className?: string }) {
  return <div className={`cover ${className} art-${asset?.poster || 'poster'}`}>
    {asset?.imported ? <FileVideo size={30} /> : <img src={coverImages[asset?.poster || 'poster'] || coverImages.poster} alt="" loading="lazy" />}
    {className !== 'mini-cover' && <><span className="cover-caption">{asset?.imported?"LOCAL VIDEO":"SHANYE / 山野"}</span><span className="duration">{asset?.duration}</span></>}
  </div>;
}

export default function App({ desktopApi,commentDrafts }: { desktopApi?: DesktopApi;commentDrafts?:CommentDraftController }) {
  const desktop=!!desktopApi;
  const [commentSummary,setCommentSummary]=useState<CommentSummary|null>(null);
  const [summaryError,setSummaryError]=useState('');
  const [closeError,setCloseError]=useState('');
  const refreshCommentSummary=()=>{if(desktopApi)void desktopApi.getCommentSummary().then(value=>{setCommentSummary(value);setSummaryError('');}).catch(()=>setSummaryError('评论数量读取失败'));};
  const emptyDraft=useMemo(()=>({commentId:null,text:'',revision:0,dirty:false,saving:false,error:'',closing:false}),[]);
  const rootDraft=useSyncExternalStore(commentDrafts?.subscribe??(()=>()=>{}),commentDrafts?.snapshot??(()=>emptyDraft));
  const gateway=useMemo(()=>desktopApi?desktopGateway(desktopApi):demoGateway,[desktopApi]);
  const {workspace,setWorkspace,refresh,loading,error:storageError}=useWorkspace(gateway);
  const busyRef=useRef(false);
  const [busy,setBusy]=useState(false);
  const [focusTask,setFocusTask]=useState<{id:string;request:number}|null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [localQuery, setLocalQuery] = useState('');
  const [assetFilter, setAssetFilter] = useState('全部素材');
  const [taskFilter, setTaskFilter] = useState('全部任务');
  const [messageFilter, setMessageFilter] = useState('全部消息');
  const [selectedMessage, setSelectedMessage] = useState('m1');
  const [draftText, setDraftText] = useState('');
  const [notifications, setNotifications] = useState(false);
  const [running, setRunning] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<'week' | 'month'>('week');
  const [chartHover, setChartHover] = useState<number | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedAsset, setSelectedAsset] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const runRef = useRef(false);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = workspace.tasks.filter(t => t.status === 'pending');
  const unread = workspace.messages.filter(m => !m.processed);
  const unreadCount=desktop?(commentSummary?.unprocessed??0):unread.length;
  useEffect(()=>{refreshCommentSummary();},[desktopApi,page,workspace.accounts.length]);
  const message = workspace.messages.find(m => m.id === selectedMessage);

  function notify(text: string) { setToast(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3800); }
  const navigation=useRef(0);
  async function navigate(next: Page) { const ticket=++navigation.current;try{if(commentDrafts)await commentDrafts.flushAll();if(ticket!==navigation.current)return;setPage(next);setLocalQuery('');setQuery('');setNotifications(false);}catch(error){notify(error instanceof Error?error.message:'草稿保存失败，请重试');} }
  useEffect(()=>{const handler=(e:Event)=>{setCloseError((e as CustomEvent<string>).detail);notify((e as CustomEvent<string>).detail);};window.addEventListener('xumu-draft-close-error',handler);return()=>window.removeEventListener('xumu-draft-close-error',handler);},[]);
  function openTask(assetId?: string) {
    const id = assetId || workspace.assets.find(a => !a.availability || a.availability === 'ready')?.id || '';
    if (desktop && workspace.assets.find(a => a.id === id)?.availability && workspace.assets.find(a => a.id === id)?.availability !== 'ready') { notify('素材文件不可用，请重新导入原视频'); return; }
    setSelectedAsset(id); setTaskTitle(workspace.assets.find(a => a.id === id)?.title || ''); setSelectedAccounts([]); setModal({ type: 'task', assetId });
  }
  async function desktopCommand(action:()=>Promise<unknown>,success:string,close=true):Promise<boolean>{
    if(busyRef.current){notify('上一项操作尚未完成，请稍候');return false;}
    busyRef.current=true;setBusy(true);const initiatingModal=modal;
    try{await action();await refresh();if(close)setModal(current=>current===initiatingModal?null:current);if(success)notify(success);return true;}
    catch(error){notify(error instanceof Error?error.message:'操作失败，请重试');return false;}
    finally{busyRef.current=false;setBusy(false);}
  }
  function requestImport(){if(!desktopApi){fileInput.current?.click();return;}void desktopCommand(async()=>{const result=await desktopApi.importVideos();if(result.added||result.repaired){navigate('assets');setAssetFilter('全部素材');}notify(`已导入 ${result.added} 个视频，恢复 ${result.repaired} 个，重复 ${result.duplicates} 个${result.failures.length?`，失败 ${result.failures.length} 个：${result.failures[0].reason}`:''}`);},'',false);}
  function assetStatus(asset:Asset){return asset.availability==='missing'?'文件缺失，请重新导入':asset.availability==='corrupt'?'文件损坏，请重新导入':'本机已保存';}
  function accountStatus(account:Account){return account.demo?'示例账号':account.loginStatus==='logged_in'?'已核实':account.loginStatus==='opening'?'正在打开':account.loginStatus==='pending_confirmation'?'待确认':account.loginStatus==='expired'?'已过期':'未连接';}
  function connectAccount(accountId:string){if(!desktopApi)return;void desktopCommand(async()=>{const observation=await desktopApi.openAccount(accountId);notify(observation.reason||'已核实账号身份');},'',false);}
  function checkAccount(accountId:string){if(!desktopApi)return;void desktopCommand(async()=>{const observation=await desktopApi.getConnection(accountId);notify(observation.reason||'账号状态已刷新');},'',false);}
  function inspectAccount(accountId:string){if(!desktopApi)return;void desktopCommand(async()=>{const report=await desktopApi.inspectAccount(accountId);setModal({type:'site-check',report});},'',false);}
  useEffect(() => { setDraftText(message?.draft || ''); }, [selectedMessage, message?.draft]);
  useEffect(() => () => { runRef.current = false; clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href]'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [!!modal]);

  function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get('name') || '').trim();
    if (!name) return;
    if(desktopApi){void desktopCommand(()=>desktopApi.createAccount({name,handle:String(form.get('handle')||'').trim(),group:String(form.get('group')||'未分组')}),'账号档案已保存到本机');return;}
    const account: Account = { id: uid(), name, handle: String(form.get('handle') || '').trim(), group: String(form.get('group') || '未分组'), initial: name[0], color: ['olive','peach','lavender','blue'][workspace.accounts.length % 4], demo: false, followers: '—' };
    setWorkspace(w => ({ ...w, accounts: [...w.accounts, account] })); setModal(null); notify('账号档案已添加，尚未连接抖音');
  }
  function editAsset(event: FormEvent<HTMLFormElement>, asset: Asset) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const title = String(form.get('title') || '').trim(); if (!title) return;
    if(desktopApi){void desktopCommand(()=>desktopApi.updateAsset(asset.id,{title,tag:String(form.get('tag')||'未分类')}),'素材信息已保存');return;}
    setWorkspace(w => ({ ...w, assets: w.assets.map(a => a.id === asset.id ? { ...a, title, tag: String(form.get('tag') || '').trim() || '未分类' } : a) })); setModal(null); notify('素材信息已保存');
  }
  function createTasks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedAsset || !selectedAccounts.length || !taskTitle.trim()) return;
    if(desktopApi){void desktopCommand(()=>desktopApi.createTasks({assetId:selectedAsset,accountIds:selectedAccounts,title:taskTitle.trim()}),'本地任务已保存').then(ok=>{if(ok)navigate('tasks');});return;}
    const eligible = selectedAccounts.filter(id => !workspace.tasks.some(t => t.accountId === id && t.assetId === selectedAsset && ['pending','running','review'].includes(t.status)));
    if (!eligible.length) { notify('这些账号已有该素材的未完成任务，请勿重复创建'); return; }
    const tasks: Task[] = eligible.map(accountId => ({ id: uid(), accountId, assetId: selectedAsset, title: taskTitle.trim(), status: 'pending', time: '手动执行' }));
    setWorkspace(w => ({ ...w, tasks: [...tasks, ...w.tasks] })); setModal(null); navigate('tasks'); notify(`已创建 ${tasks.length} 个本地任务${eligible.length !== selectedAccounts.length ? '，已跳过重复项' : ''}`);
  }
  async function runDemo() {
    if (runRef.current) return; setModal(null); runRef.current = true; setRunning(true);
    for (const task of pending) {
      if (!runRef.current) break;
      if (workspaceRef.current.tasks.find(t => t.id === task.id)?.status !== 'pending') continue;
      setWorkspace(w => ({ ...w, tasks: w.tasks.map(t => t.id === task.id ? { ...t, status: 'running' } : t) }));
      await new Promise(resolve => setTimeout(resolve, 1500));
      setWorkspace(w => ({ ...w, tasks: w.tasks.map(t => t.id === task.id ? { ...t, status: 'demo_done' } : t) }));
    }
    runRef.current = false; setRunning(false); notify('演示已结束，没有向抖音上传或发布视频');
  }
  function saveDraft() {
    if (!message) return; setWorkspace(w => ({ ...w, messages: w.messages.map(m => m.id === message.id ? { ...m, draft: draftText } : m) })); notify('回复草稿已保存在本机，未发送');
  }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const valid = Array.from(files).filter(f => /\.(mp4|mov)$/i.test(f.name));
    const assets: Asset[] = valid.map(f => ({ id: uid(), title: f.name.replace(/\.[^.]+$/, ''), filename: f.name, poster: 'poster', tag: '本地导入', duration: '本地文件', size: `${(f.size / 1024 / 1024).toFixed(1)} MB`, imported: true }));
    if (assets.length) { setWorkspace(w => ({ ...w, assets: [...assets, ...w.assets] })); navigate('assets'); setAssetFilter('全部素材'); }
    notify(assets.length ? `已导入 ${assets.length} 条视频信息，文件未上传${valid.length !== files.length ? '；已跳过非 MP4/MOV 文件' : ''}` : '请选择 MP4 或 MOV 视频');
    if (fileInput.current) fileInput.current.value = '';
  }
  const searchResults = query.trim() ? [
    ...workspace.accounts.filter(a => `${a.name}${a.handle}`.includes(query.trim())).map(a => ({ id: a.id, title: a.name, sub: '账号档案', page: 'accounts' as Page })),
    ...workspace.assets.filter(a => `${a.title}${a.filename}`.includes(query.trim())).map(a => ({ id: a.id, title: a.title, sub: '视频素材', page: 'assets' as Page })),
    ...workspace.tasks.filter(a => a.title.includes(query.trim())).map(a => ({ id: a.id, title: a.title, sub: '发布任务', page: 'tasks' as Page })),
  ].slice(0, 7) : [];

  function AccountLine({ account }: { account: Account }) { return <div className="account-line"><Avatar account={account} /><div className="account-name"><strong>{account.name}</strong><span>{account.group}</span></div><span className={`tiny-status ${account.demo ? 'example' : ''}`}><i />{accountStatus(account)}</span></div>; }
  function renderTaskTable({ compact = false }: { compact?: boolean }) {
    const tasks = (compact ? workspace.tasks.slice(0, 3) : workspace.tasks).filter(t => (compact || taskFilter === '全部任务' || (taskFilter === '待执行' && t.status === 'pending') || (taskFilter === '已完成' && t.status === 'demo_done') || (taskFilter === '已取消' && t.status === 'cancelled') || (taskFilter === '待核对' && t.status === 'review')) && t.title.includes(localQuery));
    return <div className="table-scroll"><table className="task-table"><thead><tr><th>作品内容</th><th>发布账号</th><th>{compact ? '计划时间' : '执行方式'}</th><th>状态</th><th className="last-cell">操作</th></tr></thead><tbody>{tasks.map(task => {
      const asset = workspace.assets.find(a => a.id === task.assetId); const account = workspace.accounts.find(a => a.id === task.accountId);
      return <tr key={task.id}><td><div className="table-content"><Cover asset={asset} className="mini-cover" /><div><strong>{task.title}</strong><span>{asset?.duration} <span className="table-dot">·</span> {asset?.tag}</span></div></div></td><td><span className="table-account">{account && <Avatar account={account} small />}{account?.name || '账号不存在'}</span></td><td><span className="muted small-text">{task.time}</span></td><td><Badge status={task.status} desktop={desktop} /></td><td className="last-cell"><button className="icon-button" aria-label={`查看任务：${task.title}`} onClick={() => {if(desktop){setFocusTask(previous=>({id:task.id,request:(previous?.request||0)+1}));navigate('tasks');}else setModal({ type: 'detail', task });}}><Ellipsis size={18} /></button></td></tr>;
    })}</tbody></table>{!tasks.length && <Empty title="这里还没有任务" description="选择一条素材，为账号创建发布任务。" action={<button className="button primary small-button" onClick={() => openTask()}><Plus size={15} />创建任务</button>} />}</div>;
  }

  function renderOverview() {
    const chart = chartPeriod === 'week' ? [18, 31, 25, 45, 34, 62, 51, 71, 57, 77, 68, 91, 72, 88] : [12, 20, 15, 35, 27, 52, 39, 68, 47, 75, 64, 85, 73, 96];
    const path = chart.map((value, i) => `${i === 0 ? 'M' : 'L'} ${25 + i * 40} ${158 - value * 1.3}`).join(' ');
    return <>
      <div className="page-heading overview-heading"><div><div className="eyebrow"><span />YOUR CREATIVE SPACE</div><h1>让创作，井井有条<span className="heading-dot">。</span></h1><p>内容有计划，运营有节奏。今天也是灵感满满的一天。</p></div><button className="button primary" onClick={() => openTask()}><Plus size={17} />新建发布任务</button></div>
      <div className="stats-grid">
        <Stat title="管理账号" value={String(workspace.accounts.length).padStart(2,'0')} suffix="个" icon={<Users size={20} />} tint="green" foot={<><span className="stat-foot-dot" />{desktop?`${workspace.accounts.filter(a=>a.loginStatus==='logged_in').length} 个已核实 · ${workspace.accounts.filter(a=>a.loginStatus!=='logged_in').length} 个待连接`:`${workspace.accounts.filter(a => a.demo).length} 个示例 · ${workspace.accounts.filter(a => !a.demo).length} 个未连接`}</>} />
        <Stat title="待执行任务" value={String(pending.length).padStart(2,'0')} suffix="条" icon={<CalendarDays size={20} />} tint="orange" foot={<><Clock3 size={12} />准备好了，等你开始</>} />
        <Stat title="内容素材" value={String(workspace.assets.length).padStart(2,'0')} suffix="条" icon={<Clapperboard size={20} />} tint="purple" foot={<><span className="trend">+ {desktop?workspace.assets.filter(a=>!a.availability||a.availability==='ready').length:(workspace.assets.filter(a => a.imported).length || 6)}</span> {desktop?'条本地保存':workspace.assets.some(a => a.imported) ? '条本地导入' : '条精选示例素材'}</>} />
        <Stat title="待处理消息" value={desktop&&!commentSummary?'—':String(unreadCount).padStart(2,'0')} suffix="条" icon={<MessageSquare size={20} />} tint="blue" foot={<><span className="message-foot">{desktop?(commentSummary?.unprocessed??'—'):unread.filter(m => m.type === 'comment').length} 条{desktop?'本地待处理评论':'评论'}</span><span className="subtle-dot">·</span>{desktop?'私信尚未接通':`${unread.filter(m => m.type === 'private').length} 条私信（示例）`}</>} />
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-main">
          {desktop?<section className="panel trend-panel"><Empty title="内容数据尚未接入" description="创建账号档案并导入视频，先整理你的创作。播放量与互动数据暂未同步。" action={<button className="button primary" onClick={requestImport}><Upload size={16}/>导入第一个视频</button>}/></section>:<section className="panel trend-panel"><div className="panel-heading"><div><h2>内容表现 <span className="example-label">示例数据</span></h2><p>好内容，在持续积累中被看见</p></div><div className="segmented"><button className={chartPeriod === 'week' ? 'active' : ''} onClick={() => setChartPeriod('week')}>近 7 天</button><button className={chartPeriod === 'month' ? 'active' : ''} onClick={() => setChartPeriod('month')}>近 30 天</button></div></div>
            <div className="chart-summary"><strong>{chartPeriod === 'week' ? '128,640' : '486,250'}</strong><span>示例播放量</span><span className="chart-growth"><ArrowUpRight size={13} />{chartPeriod === 'week' ? '18.6' : '24.8'}%</span><span className="chart-legend"><i />播放趋势</span></div>
            <div className="chart-wrap"><div className="chart-y"><span>10w</span><span>7.5w</span><span>5w</span><span>2.5w</span></div><svg viewBox="0 0 570 180" preserveAspectRatio="none" role="img" aria-label="示例播放量趋势图"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b6ca91" stopOpacity=".35" /><stop offset="100%" stopColor="#b6ca91" stopOpacity="0" /></linearGradient></defs>{[25,65,105,145].map(y => <line key={y} x1="0" x2="570" y1={y} y2={y} stroke="#edf0ec" strokeDasharray="3 4" />)}<path d={`${path} L 545 175 L 25 175 Z`} fill="url(#chartFill)" /><path d={path} fill="none" stroke="#7a9b56" strokeWidth="2.5" strokeLinejoin="round" />{chart.map((v,i) => <g key={i} onMouseEnter={() => setChartHover(i)} onMouseLeave={() => setChartHover(null)}><rect x={i*40+7} y="0" width="40" height="180" fill="transparent" />{chartHover === i && <><line x1={25+i*40} x2={25+i*40} y1="0" y2="180" stroke="#b8c7aa" strokeDasharray="3 3" /><circle cx={25+i*40} cy={158-v*1.3} r="4" fill="#789b54" stroke="white" strokeWidth="2" /><rect x={Math.min(25+i*40,460)} y="1" width="94" height="26" rx="5" fill="#273b31" /><text x={Math.min(25+i*40,460)+47} y="18" textAnchor="middle" fill="white" fontSize="10">示例 {(v*1340).toLocaleString()}</text></>}</g>)}</svg></div><div className="chart-x">{(chartPeriod === 'week' ? ['10/11','10/12','10/13','10/14','10/15','10/16','10/17'] : ['09/18','09/23','09/28','10/03','10/08','10/13','10/17']).map(d => <span key={d}>{d}</span>)}</div>
          </section>}
          <section className="panel queue-panel"><div className="panel-heading"><div className="inline-heading"><h2>发布队列</h2><span className="count-pill">{pending.length} 待执行</span></div><button className="text-button" onClick={() => navigate('tasks')}>查看全部<ArrowRight size={14} /></button></div>{renderTaskTable({ compact: true })}<div className="panel-note"><span className="soft-dot" />{desktop?'本地发布计划已保存。真实发布尚未接通，任务不会自动执行。':'当前为交互演示，任务不会实际发布到抖音。'}<ShieldCheck size={13} /></div></section>
        </div>
        <aside className="dashboard-aside">
          <section className="panel matrix-panel"><div className="panel-heading"><h2>我的账号<span className="plain-count">{workspace.accounts.length}</span></h2><button className="icon-button" aria-label="添加账号" onClick={() => setModal({ type: 'account' })}><Plus size={17} /></button></div>{workspace.accounts.slice(0,4).map(account => <AccountLine key={account.id} account={account} />)}<button className="all-accounts" onClick={() => navigate('accounts')}>管理全部账号<ArrowUpRight size={14} /></button></section>
          <section className="inspiration-panel"><div className="inspiration-top"><span><Sparkles size={14} />创作小灵感</span><span className="tiny-outline">VOL. 017</span></div><h3>日常，就是最好的素材。</h3><p>一杯咖啡的时间，一个真实的瞬间。<br />把生活里的小美好，分享给更多人。</p><button onClick={() => { navigate('assets'); setAssetFilter('生活灵感'); }}>去寻找灵感<ArrowUpRight size={14} /></button><Coffee className="inspiration-art" size={95} strokeWidth={.8} /></section>
          <section className="panel todo-panel"><div className="panel-heading"><h2>待办提醒</h2><span className="soft-count">{unreadCount}</span></div><button className="todo-item" onClick={() => navigate('messages')}><span className="todo-icon peach"><MessageCircle size={17} /></span><span><strong>还有 {unreadCount} 条消息待处理</strong><small>及时回应每一份喜欢</small></span><ChevronRight size={15} /></button><button className="todo-item" onClick={() => navigate('tasks')}><span className="todo-icon olive"><CalendarDays size={17} /></span><span><strong>{pending.length} 条内容准备就绪</strong><small>查看你的发布计划</small></span><ChevronRight size={15} /></button></section>
        </aside>
      </div>
      <section className="recent-section"><div className="section-heading"><h2>最近素材<span>让每一次灵感，都有迹可循</span></h2><button className="text-button" onClick={() => navigate('assets')}>进入素材库<ArrowRight size={14} /></button></div><div className="recent-grid">{workspace.assets.slice(0,4).map(asset => <button className="recent-card" key={asset.id} onClick={() => setModal({ type: 'asset', asset })}><Cover asset={asset} /><div className="recent-card-content"><h3>{asset.title}</h3><span>{asset.tag}<span>·</span>{asset.size}</span><ArrowUpRight size={15} /></div></button>)}</div></section>
    </>;
  }

  function renderAccounts() {
    const accounts = workspace.accounts.filter(a => `${a.name}${a.handle}${a.group}`.includes(localQuery));
    return <><PageHeading eyebrow="ACCOUNT MATRIX" title="每一个账号，都有自己的主场。" subtitle="集中管理账号档案，给每一种表达留一个位置。" action={<button className="button primary" onClick={() => setModal({ type: 'account' })}><Plus size={17} />添加账号</button>} /><div className="notice"><ShieldCheck size={17} /><span>{desktop?'每个账号使用独立浏览器配置。官方扫码完成后，点击“检查状态”读取当前账号身份；发布和评论仍待接入。':'账号会话隔离保存在 Windows 本机。当前为界面演示，扫码登录尚未接通。'}</span>{!desktop && <a href={officialUrl} target="_blank" rel="noreferrer">打开官方创作者中心<ExternalLink size={13} /></a>}</div><div className="list-toolbar"><div className="tab-list"><button className="active">全部账号 <span>{workspace.accounts.length}</span></button></div><LocalSearch value={localQuery} onChange={setLocalQuery} placeholder="搜索账号或分组" /></div><div className="accounts-grid">{accounts.map(account => <section className="panel account-card" key={account.id}><div className="account-card-top"><Avatar account={account} /><span className={`tiny-status ${account.demo ? 'example' : ''}`}><i />{accountStatus(account)}</span></div><h2>{account.name}</h2><div className="account-handle">{account.handle ? `@${account.handle}` : '尚未填写抖音号'}</div><span className="account-group">{account.group}</span>{desktop&&account.loginStatus==='logged_in'&&account.identity&&<p className="account-site-identity">官网昵称：{account.identity.displayName}</p>}<div className="account-card-stats"><div><strong>{account.followers}</strong><span>{account.demo ? '示例粉丝数' : '粉丝数未同步'}</span></div><div><strong>{workspace.tasks.filter(t => t.accountId === account.id && t.status === 'pending').length}</strong><span>待执行任务</span></div><div><strong>{desktop?(commentSummary?.accounts.find(a=>a.accountId===account.id)?.unprocessed??'—'):workspace.messages.filter(m => m.accountId === account.id && !m.processed).length}</strong><span>{desktop?'本地待处理评论':'待处理示例消息'}</span></div></div><div className="account-card-actions"><button className="button secondary small-button" onClick={() => desktop ? connectAccount(account.id) : setModal({ type: 'info', title: '扫码登录接入说明', text: '当前是浏览器界面演示，没有建立 Windows 独立浏览器会话。你可以打开抖音官方创作者中心自行登录；网页登录不会被此演示读取，也不会把账号标记为已连接。桌面版接入完成后，将在你的 Windows 设备上验证扫码及账号隔离。' })}><Monitor size={14} />扫码登录</button><>{desktop?<button className="button ghost small-button" onClick={()=>checkAccount(account.id)}>检查状态<ShieldCheck size={13}/></button>:<a href={officialUrl} target="_blank" rel="noreferrer" className="button ghost small-button">官方页面<ExternalLink size={13} /></a>}</></div>{desktop&&<button className="button ghost small-button" aria-disabled={busy} onClick={()=>inspectAccount(account.id)}>生成接入检查</button>}</section>)}<button className="add-account-card" onClick={() => setModal({ type: 'account' })}><span><Plus size={26} /></span><strong>为新的表达，留一个位置</strong><small>添加你的账号档案</small></button></div>{!accounts.length && <Empty title="没有找到匹配的账号" description="试试其他名称或分组。" />}</>;
  }

  function renderAssets() {
    const assets = workspace.assets.filter(a => (assetFilter === '全部素材' || a.tag === assetFilter) && `${a.title}${a.filename}`.includes(localQuery));
    return <><PageHeading eyebrow="CONTENT LIBRARY" title="灵感有迹，创作有序。" subtitle="把好内容收进素材库，让下一次发布从容开始。" action={<><button className="button secondary" onClick={() => openTask()}><Plus size={16} />创建任务</button><button className="button primary" onClick={requestImport}><Upload size={16} />导入视频</button></>} /><div className="list-toolbar"><div className="tab-list">{['全部素材','新品上新','门店日常','咖啡日记','生活灵感','本地导入'].map(tab => <button key={tab} className={assetFilter === tab ? 'active' : ''} onClick={() => setAssetFilter(tab)}>{tab}{tab === '全部素材' && <span>{workspace.assets.length}</span>}</button>)}</div><LocalSearch value={localQuery} onChange={setLocalQuery} placeholder="搜索标题或文件名" /></div><div className="assets-grid">{assets.map(asset => <article className="asset-card" key={asset.id}><button className="asset-image-button" onClick={() => setModal({ type: 'asset', asset })}><Cover asset={asset} /><span className="asset-hover"><Play size={20} />查看素材信息</span></button><div className="asset-body"><span className="asset-tag">{asset.tag}</span><h2>{asset.title}</h2><p>{asset.filename}</p><div className="asset-card-footer"><span>{asset.imported ? (desktop?assetStatus(asset):'本地文件信息') : '示例素材'}<i />{asset.size}</span><button className="icon-button" aria-label={`为${asset.title}创建任务`} disabled={desktop&&!!asset.availability&&asset.availability!=='ready'} onClick={() => openTask(asset.id)}><Plus size={18} /></button></div></div></article>)}</div>{!assets.length && <Empty title="灵感还在路上" description="这里还没有素材，试试导入视频或切换分类。" action={<button className="button primary" onClick={requestImport}><Upload size={16} />导入视频</button>} />}<div className="bottom-note"><FolderOpen size={14} />{desktop?'视频已复制到本机素材目录；原文件移动后仍可保留。尚未向抖音上传。':'演示仅保存视频文件信息，不会上传或持久保存原始视频。'}</div></>;
  }

  function renderTasks() {
    if(desktopApi)return <DesktopPublishingPage api={desktopApi} onChanged={refresh} changeSignal={workspace.tasks} onCreate={()=>openTask()} focusTask={focusTask}/>;
    return <><PageHeading eyebrow="PUBLISHING STUDIO" title="好内容，按你的节奏登场。" subtitle="从准备到完成，让每一条内容都有清晰的下一步。" action={<button className="button primary" onClick={() => openTask()}><Plus size={17} />新建发布任务</button>} /><div className="task-summary"><div><span className="summary-icon olive"><CalendarDays size={21} /></span><div><strong>{pending.length}<small>条待执行</small></strong><p>素材就位，随时开始</p></div></div><div><span className="summary-icon lavender"><CheckCheck size={21} /></span><div><strong>{workspace.tasks.filter(t => t.status === (desktop?'cancelled':'demo_done')).length}<small>{desktop?'条已取消':'条演示完成'}</small></strong><p>{desktop?'已取消的本地任务':'演示结果，不是真实发布'}</p></div></div><div><span className="summary-icon peach"><ShieldCheck size={21} /></span><div><strong>人工确认</strong><p>每一步，都在你的掌握之中</p></div></div><div className="task-run-actions">{desktop?<span className="neutral-pill">发布接入待验证</span>:running ? <button className="button secondary" onClick={() => { runRef.current = false; notify('已请求暂停，当前演示任务结束后停止'); }}><Pause size={16} />暂停队列</button> : <button className="button dark" disabled={!pending.length} onClick={() => setModal({ type: 'run' })}><Play size={15} />演示运行</button>}</div></div><section className="panel all-tasks-panel"><div className="list-toolbar"><div className="tab-list">{(desktop?['全部任务','待执行','已取消']:['全部任务','待执行','已完成','待核对']).map(tab => <button key={tab} className={taskFilter === tab ? 'active' : ''} onClick={() => setTaskFilter(tab)}>{tab}</button>)}</div><LocalSearch value={localQuery} onChange={setLocalQuery} placeholder="搜索作品标题" /></div>{renderTaskTable({})}<div className="panel-note"><ShieldCheck size={14} />{desktop?'任务保存在本机。尚未接通真实发布，不会自动上传或发布视频。':'未接通抖音发布。演示运行只改变本地任务状态，不会上传视频。'}</div></section></>;
  }

  function renderMessages() {
    if(desktopApi&&commentDrafts)return <DesktopCommentsPage api={desktopApi} accounts={workspace.accounts as import('../shared/desktop-contracts').DesktopAccount[]} drafts={commentDrafts} onChanged={refreshCommentSummary}/>;
    const messages = workspace.messages.filter(m => (messageFilter === '全部消息' || (messageFilter === '待处理' && !m.processed) || (messageFilter === '评论' && m.type === 'comment') || (messageFilter === '私信' && m.type === 'private')) && `${m.name}${m.text}`.includes(localQuery));
    return <><PageHeading eyebrow="INBOX & CONVERSATIONS" title="每一份喜欢，都值得回应。" subtitle="在一个地方，接住来自不同账号的声音。" action={<span className="offline-label"><CloudOff size={15} />示例消息 · 未接通同步</span>} /><section className="panel inbox-panel"><div className="inbox-list"><div className="inbox-toolbar"><LocalSearch value={localQuery} onChange={setLocalQuery} placeholder="搜索消息或联系人" /><div className="tab-list">{['全部消息','待处理','评论','私信'].map(tab => <button key={tab} className={messageFilter === tab ? 'active' : ''} onClick={() => setMessageFilter(tab)}>{tab}</button>)}</div></div><div className="message-list">{messages.map(m => <button className={`message-row ${selectedMessage === m.id ? 'selected' : ''}`} key={m.id} onClick={() => setSelectedMessage(m.id)}><span className={`person-avatar ${m.color}`}>{m.initial}</span><span className="message-preview"><span className="message-person"><strong>{m.name}</strong><time>{m.time}</time></span><span className="message-text">{m.text}</span><span className="message-meta">{workspace.accounts.find(a => a.id === m.accountId)?.name}<i />{m.type === 'comment' ? '视频评论' : '私信'}{m.processed && <span className="processed-mark"><Check size={11} />已处理</span>}</span></span>{!m.processed && <span className="unread-dot" />}</button>)}</div>{!messages.length && <Empty title="这里很安静" description="没有符合筛选条件的消息。" />}</div><div className="conversation">{message ? <><div className="conversation-heading"><div><strong>{message.name}</strong><span>来自 {workspace.accounts.find(a => a.id === message.accountId)?.name} · {message.type === 'comment' ? '视频评论' : '私信'}</span></div><button className="button secondary small-button" onClick={() => { setWorkspace(w => ({ ...w, messages: w.messages.map(m => m.id === message.id ? { ...m, processed: !m.processed } : m) })); notify(message.processed ? '已标记为待处理' : '已标记为已处理（本地）'); }}><CheckCheck size={14} />{message.processed ? '撤销处理' : '标记已处理'}</button></div><div className="conversation-body"><div className="conversation-date">10 月 17 日 · 示例会话</div><div className="chat-line"><span className={`person-avatar ${message.color}`}>{message.initial}</span><div><div className="chat-bubble">{message.text}</div><time>{message.time}</time></div></div><div className="chat-hint"><ShieldCheck size={13} />当前展示示例内容，未读取真实评论或私信</div></div><div className="reply-box"><div className="reply-label"><span>回复草稿</span><span><span className="soft-dot" />仅保存在本机</span></div><textarea aria-label="回复草稿" placeholder="写下一份有温度的回应…" value={draftText} onChange={e => setDraftText(e.target.value)} maxLength={2000} /><div className="reply-footer"><span>{draftText.length}/2000</span><button className="button primary small-button" onClick={saveDraft}><Check size={14} />保存草稿</button></div><p>真实回复发送尚未接通，保存草稿不会向对方发送消息。</p></div></> : <Empty title="选择一条消息" description="在左侧选择会话，查看内容和编辑草稿。" />}</div></section></>;
  }

  function renderSettings() {
    if(desktopApi)return <DesktopSettings workspace={workspace} api={desktopApi} notify={notify}/>;
    return <><PageHeading eyebrow="YOUR WORKSPACE" title="顺手的工具，从你的习惯开始。" subtitle="管理本地工作区，了解当前版本与接入进度。" /><div className="settings-grid"><section className="panel settings-panel"><h2><Monitor size={18} />版本与连接</h2><div className="setting-row"><span>当前版本</span><strong>0.1.0 · 界面交互演示</strong></div><div className="setting-row"><span>Windows 桌面安装包</span><span className="neutral-pill">尚未构建</span></div><div className="setting-row"><span>真实抖音账号连接</span><span className="neutral-pill">未接通</span></div><div className="setting-row"><span>视频发布 / 评论 / 私信</span><span className="neutral-pill">待实机验证</span></div><p className="settings-description">浏览器演示用于确认使用体验，不代表已取得平台接口权限或完成真实站点接入。</p></section><section className="panel settings-panel"><h2><ShieldCheck size={18} />本地数据</h2><p className="settings-description">账号档案、任务和草稿存放在当前浏览器中。视频原文件不会上传，切换浏览器或清理网站数据会影响这些本地记录。</p><button className="setting-action" onClick={() => { const blob = new Blob([JSON.stringify(workspace,null,2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = '序幕-演示工作区.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('已导出演示工作区，不包含视频原文件或登录凭据'); }}><span><Download size={17} /><span><strong>导出工作区</strong><small>保存账号档案、任务与草稿的 JSON 副本</small></span></span><ArrowUpRight size={16} /></button><button className="setting-action" onClick={() => setModal({ type: 'reset' })}><span><Activity size={17} /><span><strong>重置演示数据</strong><small>清除当前本地编辑，恢复最初的示例工作区</small></span></span><ArrowUpRight size={16} /></button></section></div></>;
  }

  function renderModal(): ReactNode {
    if (!modal) return null;
    if (modal.type === 'site-check') return <AccountSiteCheckDialog report={modal.report} close={()=>setModal(null)} />;
    if (modal.type === 'account') return <form onSubmit={addAccount}><ModalHeading label="ACCOUNT PROFILE" title="为你的账号，建立一个档案" description={desktop?"保存到本机后，可以为此账号打开独立的登录浏览器。":"先保存基本信息，真实扫码登录将在桌面版接入。"} /><label className="field">账号名称<input name="name" placeholder="例如：山野咖啡·杭州店" maxLength={30} required autoFocus /></label><label className="field">抖音号<span className="optional">选填</span><input name="handle" placeholder="填写抖音号，方便辨认" maxLength={50} /></label><label className="field">账号分组<select name="group"><option>品牌主号</option><option>日常分享</option><option>主理人 IP</option><option>门店账号</option><option>未分组</option></select></label><div className="modal-note"><ShieldCheck size={15} />添加档案不会登录账号，也不会索取你的密码。</div><ModalFooter close={() => setModal(null)} submit="添加账号档案" disabled={busy||loading} /></form>;
    if (modal.type === 'asset') return <form onSubmit={e => editAsset(e, modal.asset)}><ModalHeading label="CONTENT DETAILS" title="留住这一次灵感" description={modal.asset.imported ? (desktop?assetStatus(modal.asset)+'；尚未上传。':'仅保存本地文件信息，视频尚未上传。') : '这是用于界面演示的素材，不含真实视频文件。'} /><div className="asset-detail-preview"><Cover asset={modal.asset} /><div><FileVideo size={24} /><strong>{modal.asset.filename}</strong><span>{modal.asset.size} · {modal.asset.duration}</span></div></div><label className="field">作品标题<input name="title" defaultValue={modal.asset.title} maxLength={100} required /></label><label className="field">素材分类<select name="tag" defaultValue={modal.asset.tag}>{Array.from(new Set(['新品上新','门店日常','咖啡日记','生活灵感','本地导入',modal.asset.tag])).map(tag => <option key={tag}>{tag}</option>)}</select></label><ModalFooter close={() => setModal(null)} submit="保存素材信息" disabled={busy} /></form>;
    if (modal.type === 'task') return <form onSubmit={createTasks}><ModalHeading label="NEW PUBLISHING TASK" title="让下一条内容，准备登场" description={desktop?"创建本地发布计划，真实发布尚未接通。":"创建本地发布队列。当前演示不会向抖音实际发布。"} /><label className="field">选择素材<select value={selectedAsset} onChange={e => { setSelectedAsset(e.target.value); setTaskTitle(workspace.assets.find(a => a.id === e.target.value)?.title || ''); }} required><option value="" disabled>选择一个视频素材</option>{workspace.assets.map(a => <option value={a.id} key={a.id} disabled={desktop&&!!a.availability&&a.availability!=='ready'}>{a.title}{a.availability&&a.availability!=='ready'?'（需重新导入）':''}</option>)}</select></label><label className="field">发布标题<input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} maxLength={100} required /></label><fieldset className="account-picker"><legend>选择账号<span>已选 {selectedAccounts.length} 个</span></legend>{workspace.accounts.map(a => <label key={a.id}><input type="checkbox" checked={selectedAccounts.includes(a.id)} onChange={() => setSelectedAccounts(ids => ids.includes(a.id) ? ids.filter(id => id !== a.id) : [...ids,a.id])} /><Avatar account={a} small /><span>{a.name}</span><small>{a.demo ? '示例' : '未连接'}</small></label>)}</fieldset><div className="modal-note"><Copy size={15} />每个目标账号生成独立任务，重复的未完成任务会被跳过。</div><ModalFooter close={() => setModal(null)} submit={`加入发布队列${selectedAccounts.length ? `（${selectedAccounts.length}）` : ''}`} disabled={busy||!selectedAccounts.length || !selectedAsset} /></form>;
    if (modal.type === 'run') return <><ModalHeading label="DEMO RUN" title="体验一次，内容有序登场" description={`即将逐条演示 ${pending.length} 个任务的状态变化，每条约 1.5 秒。`} /><div className="demo-confirm"><Clapperboard size={32} /><h3>这只是本地演示</h3><p>不会打开抖音、上传视频或发布作品。<br />完成后显示“演示已完成”，不代表真实发布成功。</p></div><div className="modal-footer"><button className="button secondary" onClick={() => setModal(null)}>暂不运行</button><button className="button primary" onClick={runDemo}><Play size={15} />确认演示运行</button></div></>;
    if (modal.type === 'info') return <><ModalHeading label="GOOD TO KNOW" title={modal.title} /><p className="info-text">{modal.text}</p><div className="modal-footer"><button className="button secondary" onClick={() => setModal(null)}>知道了</button>{!desktop&&<a className="button primary" href={officialUrl} target="_blank" rel="noreferrer">打开官方页面<ExternalLink size={14} /></a>}</div></>;
    if (modal.type === 'detail') { const task = workspace.tasks.find(t => t.id === modal.task.id) || modal.task; return <><ModalHeading label="TASK DETAILS" title={task.title} /><div className="detail-rows"><div><span>任务状态</span><Badge status={task.status} desktop={desktop} /></div><div><span>目标账号</span><strong>{workspace.accounts.find(a => a.id === task.accountId)?.name}</strong></div><div><span>执行安排</span><strong>{task.time}</strong></div><div><span>执行范围</span><strong>{desktop?"本地任务 · 发布尚未接通":"本地演示 · 不连接抖音"}</strong></div></div><div className="modal-note"><ShieldCheck size={16} />{task.status === 'review' ? '上次演示被中断，尚未核对结果。此演示没有向抖音发送任何请求。' : desktop?'此任务已保存在本机，没有向抖音上传或发布。':'当前任务仅用于体验工作流，没有真实发布记录。'}</div><div className="modal-footer"><button className="button secondary" onClick={() => setModal(null)}>关闭</button>{['pending','review'].includes(task.status) && <button className="button danger" onClick={() => { if(desktopApi){void desktopCommand(()=>desktopApi.cancelTask(task.id),'本地任务已取消');return;}setWorkspace(w => ({ ...w, tasks: w.tasks.map(t => t.id === task.id ? { ...t, status: 'cancelled' } : t) })); setModal(null); notify('本地任务已取消'); }}>取消此任务</button>}</div></>; }
    if (modal.type === 'reset') return <><ModalHeading label="RESET WORKSPACE" title="重新开始这段体验？" description="这会移除你添加的本地账号、素材信息、任务和草稿，并恢复示例数据。操作无法撤销，建议先导出工作区。" /><div className="modal-footer"><button className="button secondary" onClick={() => setModal(null)}>保留数据</button><button className="button danger" disabled={running} onClick={() => { setWorkspace(initialWorkspace()); setModal(null); setSelectedMessage('m1'); notify('演示工作区已重置'); }}>确认重置</button></div></>;
  }

  return <div className={`app-shell ${desktop?"desktop-workspace":""}`}>
    <aside className="sidebar"><button className="brand" onClick={() => navigate('overview')} aria-label="序幕首页"><span className="brand-symbol"><i /><Play size={19} fill="currentColor" strokeWidth={0} /></span><span><strong>序幕<span> XUMU</span></strong><small>创作，自有章法</small></span></button><div className="workspace-switch"><span className="workspace-icon"><Coffee size={17} /></span><div><strong>{desktop?"我的创作工作区":"山野创作工作室"}</strong><span>{desktop?"Windows 桌面基础版":"演示工作区"}</span></div><ChevronDown size={14} /></div><div className="nav-label">工作空间</div><nav aria-label="主导航">{navItems.map(item => <button key={item.id} aria-label={item.label} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.id === 'messages' && unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}{item.id === 'assets' && <span className="nav-shortcut">{workspace.assets.length}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="local-card"><div><span className="local-dot" />本地工作，安心创作</div><p>{desktop?<>档案与素材保存在本机<br/>各账号使用独立浏览器</>:<>档案与草稿留在当前浏览器<br/>示例数据不会同步到抖音</>}</p><span><ShieldCheck size={12} />LOCAL WORKSPACE</span></div><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={18} /><span>工作区设置</span></button><button className="nav-item" onClick={() => setModal({ type: 'info', title: '欢迎来到序幕', text: desktop?'桌面版可以保存账号档案、导入真实视频、创建本地任务，并打开各账号的独立登录浏览器。扫码在官方页面完成；账号身份识别需要 Windows 实机核实，发布与消息接入尚未完成。':'你可以添加账号档案、导入 MP4/MOV 文件信息、创建演示发布任务，并在消息中心保存回复草稿。所有示例账号和指标均为虚构。真实扫码登录、视频发布和消息同步尚未接通；本演示用于确认界面和使用流程。' })}><CircleHelp size={18} /><span>帮助与反馈</span><ArrowUpRight size={13} /></button><div className="profile"><span className="profile-avatar">S</span><div><strong>{desktop?"本地创作者":"山野创作者"}</strong><span>{desktop?"桌面工作区":"本地体验版"}</span></div><span className="profile-badge">{desktop?"LOCAL":"DEMO"}</span></div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">工作空间<ChevronRight size={12} /><strong>{pageLabels[page]}</strong></div><div className="topbar-right"><div className="global-search"><Search size={15} /><input aria-label="全局搜索" placeholder="搜索素材、账号或任务" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }} /><span>搜索</span>{query.trim() && <div className="search-results">{searchResults.length ? searchResults.map(result => <button key={`${result.page}-${result.id}`} onClick={async () => { await navigate(result.page); setLocalQuery(result.title); }}><Search size={14} /><span><strong>{result.title}</strong><small>{result.sub}</small></span><ArrowUpRight size={14} /></button>) : <p>没有找到相关内容</p>}</div>}</div><span className="topbar-divider" /><div className="notification-wrap"><button className="icon-button notification-button" aria-label="通知" aria-expanded={notifications} onClick={() => setNotifications(v => !v)}><Bell size={18} /><i /></button>{notifications && <div className="notifications"><strong>工作区提醒<span>{desktop?"本地工作区":"本地演示"}</span></strong><button onClick={() => navigate('tasks')}><CalendarDays size={18} /><span>{pending.length} 条任务等待执行<small>{desktop?"查看本地发布计划":"点击查看演示发布队列"}</small></span><ChevronRight size={14} /></button><button onClick={() => navigate('messages')}><MessageSquare size={18} /><span>{unreadCount} 条{desktop?"":"示例"}消息待处理<small>没有连接真实抖音消息</small></span><ChevronRight size={14} /></button></div>}</div><span className="top-avatar">S</span></div></header>
      <main className={`main-content page-${page}`}>{closeError&&<div role="alert" className="storage-error">{closeError}<button className="text-button" onClick={()=>setCloseError('')}>关闭</button></div>}{summaryError&&<div role="alert" className="storage-error">{summaryError}</div>}<div className="content-topline"><span><span className="connection-dot" />{desktop?"桌面工作区":"交互演示"}<span className="topline-separator">/</span>{desktop?"本地数据 · 账号身份待验证":"未连接抖音"}</span><span><CalendarDays size={12} />{desktop?new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"long",day:"numeric",weekday:"long"}).format(new Date()):<>2026 年 10 月 17 日 · 星期六<span className="sample-date">演示日期</span></>}</span></div>{rootDraft.closing&&<div className="comment-close-overlay" role="status"><LoaderCircle size={22}/>正在保存并退出，请稍候…</div>}{storageError && <div className="storage-error" role="alert">{storageError}{desktop&&<button className="text-button" onClick={()=>void refresh().catch(e=>notify(String(e.message)))}>重新加载</button>}</div>}{(loading||busy)&&<div className="desktop-progress" role="status"><LoaderCircle size={14}/>{loading?"正在读取本地工作区…":"正在处理本地操作…"}</div>}{page === 'overview' && renderOverview()}{page === 'accounts' && renderAccounts()}{page === 'assets' && renderAssets()}{page === 'tasks' && renderTasks()}{page === 'messages' && renderMessages()}{page === 'settings' && renderSettings()}<footer className="app-footer"><span>序幕 XUMU<span>让创作，回到创作本身。</span></span><span><span className="footer-dot" />{desktop?"桌面基础版":"本地交互演示 · v0.1.0"}</span></footer></main>
    </div>
    <input ref={fileInput} type="file" className="visually-hidden" accept=".mp4,.mov,video/mp4,video/quicktime" multiple aria-label="导入视频文件" onChange={e => void importFiles(e.target.files)} />
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true" aria-label="工作区操作" ref={dialogRef} tabIndex={-1}><button className="icon-button modal-close" aria-label="关闭弹窗" onClick={() => setModal(null)}><X size={19} /></button>{renderModal()}</section></div>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={17} />{toast}<button className="icon-button" aria-label="关闭提示" onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>;
}

function Stat({ title, value, suffix, icon, tint, foot }: { title: string; value: string; suffix: string; icon: ReactNode; tint: string; foot: ReactNode }) { return <section className="stat-card"><div className="stat-top"><span>{title}</span><span className={`stat-icon ${tint}`}>{icon}</span></div><div className="stat-value">{value}<span>{suffix}</span><svg viewBox="0 0 95 35" aria-hidden="true"><path d="M2 28 15 24 25 28 37 14 49 19 60 10 70 14 83 3 93 7" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg></div><div className="stat-foot">{foot}</div></section>; }
function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) { return <div className="page-heading"><div><div className="eyebrow"><span />{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="heading-actions">{action}</div>}</div>; }
function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><span><FolderOpen size={29} /></span><h3>{title}</h3><p>{description}</p>{action}</div>; }
function LocalSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="local-search"><Search size={15} /><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />{value && <button className="icon-button" aria-label="清空搜索" onClick={() => onChange('')}><X size={13} /></button>}</label>; }
function ModalHeading({ label, title, description }: { label: string; title: string; description?: string }) { return <div className="modal-heading"><div className="eyebrow"><span />{label}</div><h2>{title}</h2>{description && <p>{description}</p>}</div>; }
function ModalFooter({ close, submit, disabled = false }: { close: () => void; submit: string; disabled?: boolean }) { return <div className="modal-footer"><button className="button secondary" type="button" onClick={close}>取消</button><button className="button primary" type="submit" disabled={disabled}>{submit}<ArrowRight size={15} /></button></div>; }
