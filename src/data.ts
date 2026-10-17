export type Page = 'overview' | 'accounts' | 'assets' | 'tasks' | 'messages' | 'settings';
export type TaskStatus = 'pending' | 'running' | 'demo_done' | 'review' | 'cancelled';
export interface Account { id: string; name: string; handle: string; group: string; color: string; initial: string; demo: boolean; followers: string; loginStatus?: import('../shared/desktop-contracts').LoginStatus; identity?: import('../shared/desktop-contracts').Identity; }
export interface Asset { id: string; title: string; filename: string; poster: string; tag: string; duration: string; size: string; imported: boolean; availability?: 'ready' | 'missing' | 'corrupt' }
export interface Task { id: string; accountId: string; assetId: string; title: string; status: TaskStatus; time: string; }
export interface Message { id: string; accountId: string; name: string; initial: string; color: string; type: 'comment' | 'private'; text: string; time: string; processed: boolean; draft: string; }
export interface Workspace { version: 1; accounts: Account[]; assets: Asset[]; tasks: Task[]; messages: Message[]; }
export const STORAGE_KEY = 'xumu-workspace-v1';
export const uid = () => crypto.randomUUID();

export function initialWorkspace(): Workspace {
  return {
    version: 1,
    accounts: [
      { id: 'a1', name: '山野咖啡', handle: 'shanye.coffee', group: '品牌主号', color: 'olive', initial: '山', demo: true, followers: '2.8w' },
      { id: 'a2', name: '山野日常', handle: 'shanye.daily', group: '日常分享', color: 'peach', initial: '野', demo: true, followers: '1.2w' },
      { id: 'a3', name: '山野主理人', handle: 'shanye.owner', group: '主理人 IP', color: 'lavender', initial: '主', demo: true, followers: '8,426' },
      { id: 'a4', name: '山野好物', handle: 'shanye.select', group: '品牌主号', color: 'blue', initial: '物', demo: true, followers: '6,102' },
    ],
    assets: [
      { id: 'v1', title: '把秋天，装进一杯拿铁里', filename: '秋日拿铁_最终版.mp4', poster: 'coffee', tag: '新品上新', duration: '00:32', size: '28.6 MB', imported: false },
      { id: 'v2', title: '巷子深处，藏着一家小店', filename: '探店日记_1017.mp4', poster: 'cafe', tag: '门店日常', duration: '00:48', size: '42.1 MB', imported: false },
      { id: 'v3', title: '今天也要好好喝一杯', filename: '手冲日常_v2.mp4', poster: 'pour', tag: '咖啡日记', duration: '00:26', size: '19.8 MB', imported: false },
      { id: 'v4', title: '给生活，一点抹茶的绿', filename: '抹茶特辑.mp4', poster: 'matcha', tag: '新品上新', duration: '00:35', size: '31.4 MB', imported: false },
      { id: 'v5', title: '一颗豆子的旅行', filename: '咖啡豆的故事.mp4', poster: 'beans', tag: '咖啡日记', duration: '01:02', size: '56.3 MB', imported: false },
      { id: 'v6', title: '慢下来，好事正在发生', filename: '周末灵感.mp4', poster: 'poster', tag: '生活灵感', duration: '00:18', size: '12.9 MB', imported: false },
    ],
    tasks: [
      { id: 't1', accountId: 'a1', assetId: 'v1', title: '把秋天，装进一杯拿铁里', status: 'pending', time: '今天 14:00' },
      { id: 't2', accountId: 'a2', assetId: 'v2', title: '巷子深处，藏着一家小店', status: 'pending', time: '今天 16:30' },
      { id: 't3', accountId: 'a3', assetId: 'v3', title: '今天也要好好喝一杯', status: 'pending', time: '今天 18:00' },
      { id: 't4', accountId: 'a4', assetId: 'v4', title: '给生活，一点抹茶的绿', status: 'pending', time: '明天 10:00' },
      { id: 't5', accountId: 'a1', assetId: 'v5', title: '一颗豆子的旅行', status: 'demo_done', time: '昨天 15:20' },
    ],
    messages: [
      { id: 'm1', accountId: 'a1', name: '小林今天喝什么', initial: '林', color: 'peach', type: 'comment', text: '周末几点营业呀？想带朋友来坐坐 ☕', time: '12:42', processed: false, draft: '' },
      { id: 'm2', accountId: 'a2', name: '一只慢吞吞', initial: '慢', color: 'olive', type: 'private', text: '你好，想问问店里可以带小狗吗？', time: '12:28', processed: false, draft: '' },
      { id: 'm3', accountId: 'a1', name: '橘子汽水', initial: '橘', color: 'orange', type: 'comment', text: '这个拉花也太好看了！新口味什么时候上呀？', time: '11:56', processed: false, draft: '' },
      { id: 'm4', accountId: 'a3', name: '阿白的日常', initial: '白', color: 'blue', type: 'private', text: '请问你们有手冲体验课吗，想了解一下。', time: '11:32', processed: false, draft: '' },
      { id: 'm5', accountId: 'a4', name: '月亮不打烊', initial: '月', color: 'lavender', type: 'comment', text: '杯子好喜欢，门店能买到同款吗？', time: '10:18', processed: false, draft: '' },
      { id: 'm6', accountId: 'a2', name: '是小陈呀', initial: '陈', color: 'olive', type: 'comment', text: '今天路过来打卡了，拿铁很好喝！', time: '昨天', processed: true, draft: '谢谢喜欢，期待下次见面 ☕' },
    ],
  };
}

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialWorkspace();
    const data = JSON.parse(raw) as Workspace;
    if (data.version !== 1 || ![data.accounts, data.assets, data.tasks, data.messages].every(Array.isArray)) throw new Error('Invalid workspace');
    if (!data.accounts.every(a => typeof a.id === 'string' && typeof a.name === 'string' && typeof a.demo === 'boolean') || !data.assets.every(a => typeof a.id === 'string' && typeof a.title === 'string') || !data.tasks.every(t => typeof t.id === 'string' && typeof t.title === 'string' && ['pending', 'running', 'demo_done', 'review', 'cancelled'].includes(t.status)) || !data.messages.every(m => typeof m.id === 'string' && typeof m.text === 'string' && typeof m.draft === 'string')) throw new Error('Invalid records');
    return { ...data, tasks: data.tasks.map(t => t.status === 'running' ? { ...t, status: 'review' } : t) };
  } catch {
    return initialWorkspace();
  }
}

export const statusLabels: Record<TaskStatus, string> = { pending: '待执行', running: '演示运行中', demo_done: '演示已完成', review: '待核对', cancelled: '已取消' };
