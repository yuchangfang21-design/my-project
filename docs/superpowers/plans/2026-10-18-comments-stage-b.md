# Comments Stage B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 用户已选择当前会话直接开发（native）；不再次询问执行方式。此新计划须先经用户审阅，不能把阶段 A 的通过记录当作阶段 B 已实现。

**Goal:** 为自有抖音账号建立可持久化、按账号归属的评论工作台，支持同步状态、回复草稿、逐条确认及发送结果恢复；真实读取和回复分别通过官方页面实测后才启用。

**Architecture:** 在现有 Electron / SQLite 中增加独立的评论存储和服务，沿用账号独立 context 与唯一 OperationCoordinator。评论数据不写进演示 Workspace，发布执行器保持现有边界；桌面消息页单独实现，草稿控制器在页面切换后仍存活。

**Tech Stack:** 沿用 Node.js 24、Electron 44.9.0、better-sqlite3 13.0.3、Playwright Core 1.64.1、React 19.3.1、TypeScript 7.0.2、Vite 8.3.4；不增加产品依赖。基准提交 `78247c2e34fe5de377440e67cb2391c87647bf40`。

**Spec:** `docs/superpowers/specs/2026-10-17-publishing-and-inbox-experience-design.md` §6—8 的评论部分；发布阶段 A 已交付。私信另列阶段 C，本计划不实现其存储、同步或发送。

## Global Constraints

- “全局同一时间只执行一项站点操作，包括发布、消息同步和回复发送。”
- “去重键包含账号与消息类型。” 评论还必须绑定作品、评论、线程及稳定作者标识，不以昵称定位。
- “停止输入后 500 毫秒保存草稿，切换消息前等待当前草稿保存；保存失败则保留输入、提示原因并停留在当前消息。”
- “只有数据库确认后显示‘已保存在本机’。” 空草稿可以保存；正文不擅自 trim 或改写换行。
- “首版逐条人工发送，单次确认只覆盖一条回复。” 不增加批量回复、自动回复或无人值守同步。
- “发送前再核实账号和目标，记录发送意图，只有观察到唯一对应的远端结果才显示已发送。”
- “超时或崩溃后进入‘发送结果待核对’，保留草稿并阻止自动重发。” 重启不自动同步或发送。
- “‘标记已处理’仅影响本地运营状态，与站点已读和发送成功独立。”
- “同步失败保留上次数据并标记不是最新”；不能把失败、未同步和无匹配消息合并为普通空列表。
- “未验证回复能力时允许保存草稿和打开官方页面，发送保持不可用。” 具体评论入口未知时明确拒绝，不把首页假称评论页。
- 沿用已确认的暖白、橄榄绿界面；1440 × 1000、1280 × 900、960 × 700；窄窗口详情抽屉、键盘焦点约束。
- 正式桌面首次为空，不注入示例评论；测试夹具只能由测试内部构造。旧 HTML 演示继续独立工作。
- 只暴露具名业务 IPC，校验主窗口主框架、UUID、归属和多余字段；renderer 不能提交 SQL、路径、浏览器脚本、官方回执或真实身份。
- 原始评论与草稿作为本机业务数据保存；诊断日志、事件摘要不保存正文、Cookie、二维码或凭据。
- 保留当前隔离云工作区和 `preview/xumu-demo` 分支，不创建额外 worktree，不提交用户素材、会话或消息。

## Review Focus

1. 两个账号出现相同作品/评论 ID，或同昵称不同作者：消息、草稿、处理标记和发送目标仍隔离；不能用昵称或全局远端 ID 去重。任务 1、3。
2. 自动保存尚未返回时切换评论、筛选账号、离开页面或退出：旧响应不能覆盖新目标；失败仍保留原输入并阻止离开；正常退出需先完成保存。任务 4、5。
3. 同步到一半失败、重复页、坏游标、页面缺少旧评论：保留原有评论与成功游标，不误删、不假报同步成功、不丢已保存草稿。任务 1、2。
4. 确认后源评论被编辑/删除、作者归属变化、草稿改动或换号：旧确认不能发送；即使昵称和回复正文相同也不能匹配错误目标。任务 3。
5. 点击发送后断网、重复点击、关闭与发送并发、暂停发布时查询回复：一次确认仅一次尝试；未知结果不重发，核对只读取；评论与发布共同串行。任务 3、5。

---

## 已作出的范围选择

采用独立评论模块、复用站点协调器：能单独验收并为阶段 C 留边界；代价是增加具名 DTO/IPC。把评论和私信同时接通会扩大平台证据与归属风险，留给独立阶段；只继续画静态消息页则无法验证保存与恢复，不作为本阶段交付。

云端 2026-10-18 只读查询 GitHub Actions API 仍遭代理 403，无法确认 `desktop-build-0.3.0` 的安装包结果，不重复触发同版本构建。官网接入沿用实际证据门槛；无证据时交付本地核心、禁用适配器和 Windows 验收说明，不宣称评论已同步或已发送。

## 文件与接口约定

| 文件 | 责任 |
| --- | --- |
| `shared/comments-contracts.ts` | 评论、草稿、同步状态、确认与回执 DTO |
| `desktop/comments/store.ts` | 评论/草稿/同步/回复尝试事务及恢复 |
| `desktop/comments/adapter.ts` | 内部站点能力与默认禁用实现 |
| `desktop/comments/service.ts` | 身份、页面、核对、同步与回复调度 |
| `src/comments/CommentDraftController.ts` | 跨页面草稿保存、CAS、刷新和退出保存 |
| `src/comments/DesktopCommentsPage.tsx` | 账号、列表、详情与筛选 |
| `src/comments/CommentDetails.tsx`、`CommentReplyReviewDialog.tsx` | 本地编辑、完整发送核对及恢复 |
| `tests-desktop/comments-*.spec.ts` | 实际 Electron 的存储、服务、草稿和界面回归 |
| `docs/windows-comments-acceptance.md` | 真正的 Windows/官网验证步骤及状态 |

固定共享数据形状，后续任务不得另起同义名称：

- `CommentRecord`：`id`（本地 UUID）、`accountId`、`type:'comment'`、`ownerRemoteId`、`remoteWorkId`、`remoteThreadId`、`remoteCommentId`、`authorRemoteId`、`authorName`、`text`、`remoteCreatedAt`、`observedAt`、`sourceRevision`、`processed`、`availability:'present'|'removed'|'unsupported'`。线程 ID 使用已核实根评论标识；不得伪造会话 ID。
- `CommentDraft`：`commentId`、`revision`、`text`、`updatedAt`。每条评论初始化 revision=0、text=''；每次实际修改递增修订，重复同修订/同内容请求可返回当前值。
- `CommentSyncState`：`accountId`、`state:'never'|'syncing'|'success'|'failed'|'interrupted'`、`lastAttemptAt`、`lastSuccessAt`、`count`、`coverage:'unknown'|'partial'|'end'`、`errorCode:string|null`。时间未发生时为 null；游标只留主进程。
- `CommentReplyState`：`'draft'|'sending'|'sent'|'review'|'failed'`。人工核对不产生 sent；sent 评论不允许再次普通发送，本期不新增第二次回复意图。
- `CommentDetails`：`comment:CommentRecord`、`draft:CommentDraft`、`replyState:CommentReplyState`、`latestAttemptId:string|null`、`receipt:CommentReplyReceipt|null`、`events:CommentEvent[]`、`manualCheck:CommentManualCheck|null`。
- `CommentEvent`：`id:number`、`commentId:string`、`attemptId:string|null`、`kind:string`、`summary:string`、`createdAt:string`；`CommentManualCheck`：`result:'found'|'not_found'`、`note:string`（0—1000字符）、`createdAt:string`；没有记录时为null。所有时间为合法ISO字符串。
- `CommentReplyReceipt`：`remoteReplyId`、`accountRemoteId`、`remoteWorkId`、`remoteThreadId`、`remoteCommentId`、`recipientRemoteId`、`state:'sent'`、`officialUrl`、`observedAt`；非空唯一回复 ID 及全部归属必须匹配，不凭文本或页面提示猜测。
- `CommentReplyReview`：`id`、`commentId`、`accountId`、`sourceRevision`、`draftRevision`、以上完整目标标识、`authorName`、`sourceText`、`text`（完整回复）、`identity:Identity|null`、`contextId:string|null`、`capabilityVersion`、`createdAt`、`expiresAt`、`blockers:{code,message}[]`。主进程保存不可篡改副本，期限 5 分钟。
- `CommentReplyAttempt`（仅主进程）：`id`、`reviewId`、`commentId`、`phase:'reserved'|'submit_intent'|'finished'`、`outcome:'none'|'not_sent'|'sent'|'review'`、`snapshot:CommentReplyReview`、`receipt:CommentReplyReceipt|null`、`createdAt`。
- `CommentRecordInput = Omit<CommentRecord,'id'|'accountId'|'type'|'sourceRevision'|'processed'>`；只有已实测的明确删除证据可返回removed。正文/作者展示名/availability变化递增sourceRevision；稳定owner、作者、作品及线程归属不能被更新重绑。unsupported可以正文为空，界面标明不支持，不编造原文。
- `CommentListInput`：`accountId?:string`、`processed?:boolean`、`query?:string`、`offset:number`、`limit:number`（1—100）；排序 observedAt DESC、id DESC。详情与写入用本地 commentId，不接受 renderer 另传远端目标。
- `CommentWorkspace`：`comments:CommentRecord[]`、`total:number`、`sync:CommentSyncState[]`、`capabilities:{accountId,read:boolean,reply:boolean,reason:string}[]`。列表按需查询，不塞进现有 `WorkspaceSnapshot.messages:[]`。
- `CommentSummary`：`total`、`unprocessed`、`accounts:{accountId,total,unprocessed}[]`；只供概览和账号卡片，不携带消息正文。

本地保护上限：评论正文 8000 字符、回复草稿 2000 字符；authorName 200、所有远端标识 200；这里均指 JS 字符串 length。不是平台限制。单次用户同步最多 10 页，每页最多 200 条；全部页成功后原子落库；达到上限 coverage=partial，不能表示全量。读取/观察单动作 15 秒、准备回复 60 秒、提交回复 30 秒；沿用“超时后关闭 context 并等待原动作结束才释放队列”。

### Task 1: schema 3、评论归属、草稿与同步事务

**Files:** 创建 `shared/comments-contracts.ts`、`desktop/comments/store.ts`、`tests-desktop/comments-storage.spec.ts`；修改 `desktop/storage/migrations.ts`、`desktop/storage/repository.ts`、`tests-desktop/storage.spec.ts`（未来版本夹具使用 >3）。

**Interfaces:** `CommentStore(db)` 提供 `list(input):{comments,total}`、`details(commentId):CommentDetails`、`summary():CommentSummary`、`saveDraft({commentId,expectedRevision,text}):CommentDraft`、`markProcessed({commentId,processed}):CommentRecord`、`startSync(accountId):void`、`completeSync(accountId,ownerRemoteId,rows,cursor,coverage):CommentSyncState`、`failSync(accountId,errorCode):CommentSyncState`、`syncStates():CommentSyncState[]`、`cursor(accountId):string|null`、`recoverInterrupted():void`。Repository 持有 `comments`，旧发布方法保持兼容。

- [ ] **Step 1: 写失败测试。** `comments storage isolates remote keys and preserves draft revisions`：两个账号同远端作品/评论 ID 分别导入，断言 `expect(list.total).toBe(2)`；一方草稿和 processed 不影响另一方。空草稿可保存、正文空白/换行保持；旧 CAS 拒绝且当前草稿不变。改正文递增 sourceRevision；作者或 owner 标识变化拒绝。
- [ ] **Step 2: 运行 RED。** `npm run test:desktop -- --grep 'comments storage'`；应缺少 CommentStore/schema3，启动环境失败不作为 RED。
- [ ] **Step 3: 实现迁移与存储。** schema2→3 前一致性 serialize 备份（含 WAL，0600、唯一名称），备份失败不动库；事务内添加评论、草稿、同步状态、回复尝试、人工核对及事件表。唯一键 `(account_id,type,remote_work_id,remote_comment_id)`，外键级联不自动删除历史；草稿每条唯一，活动回复尝试每评论唯一。新库与 schema1 依序到3，未来 >3 只读检测后拒绝写入。迁移事务失败回滚，FK 检查保留。回复表完整状态机由任务3实现。
- [ ] **Step 4: 验证坏同步与旧数据。** `comments storage migration and failed sync preserve previous records`：含 WAL 的 schema2 发布/尝试/事件迁移后 ID、回执与状态保留；备份不可写、故意失败均不丢原库；未来版本文件不变。批量去重、越界或rows中ownerRemoteId与当前已观察目标不符时整批回滚，未出现的旧评论不被删，失败不推进游标或 lastSuccessAt；同步更新不覆盖草稿/processed。重启把 syncing 记 interrupted，不自动同步。目标测试、既有存储及发布测试通过。
- [ ] **Step 5: 提交。** `feat: persist account-owned comments and revisioned drafts`。

### Task 2: 只读同步服务与默认禁用能力

**Files:** 创建 `desktop/comments/adapter.ts`、`desktop/comments/service.ts`、`tests-desktop/comments-sync.spec.ts`；扩展测试夹具，不修改正式产品来注入夹具。

**Interfaces:** `CommentsAdapter.observe(page):Promise<{identity:Identity|null,canRead:boolean,canReply:boolean,version:string,reason?:string}>`；`readComments(page,cursor,signal):Promise<{comments:CommentRecordInput[],nextCursor:string|null,coverage:'partial'|'end'}>`。`CommentRecordInput` 按共享约定排除本地字段，ownerRemoteId 必填。回复接口在任务3补齐；此处不创建可调用但无保护的写入路径。`CommentsService(store,repository,sessions,coordinator,adapter)` 提供 `getCommentWorkspace(input):Promise<CommentWorkspace>`、`getCommentSummary():CommentSummary`、`getCommentDetails(commentId):CommentDetails`、`syncComments({accountId}):Promise<CommentSyncState>`、`saveCommentDraft(input):CommentDraft`、`markCommentProcessed(input):CommentRecord`、`close():Promise<void>`。

- [ ] **Step 1: 写失败测试。** `comments sync keeps account ownership and last good snapshot`：注入内部适配器读取真实本地 Chromium 页面夹具，两账号同昵称/同评论 ID 归属不混；第二页抛错时原评论、草稿、成功游标不变；重复页去重，循环游标拒绝，超出页限制标 partial。
- [ ] **Step 2: 运行 RED。** `npm run test:desktop -- --grep 'comments sync'`，应缺少模块或方法。
- [ ] **Step 3: 实现串行只读同步。** 核实当前身份/context/版本，拒绝与已绑定账号及其他档案冲突；每页再次检查，返回归属不符整批失败。一次用户同步最多2000条，先缓冲验证，再一次事务提交；分页中断不覆盖旧快照，不按缺席推断删除。游标不进入 renderer。同步、发布、登录共用唯一 coordinator，最外层只取一次锁。getCommentWorkspace只有选择了accountId时，才在该协调器中观察当前账号能力；全部账号视图不给未检查账号标为可用，提示先选择账号。能力摘要不授权写入，sync/review/send仍重新实时观察。关闭停止排新动作并等待当前动作结束。
- [ ] **Step 4: 验证禁用与超时。** UnverifiedCommentsAdapter 的 read/reply 均 false，readComments明确拒绝；任务3新增的回复方法也必须保持禁用，无配置/环境开关；历史 logged_in 不启用。模拟同步时换号、context关闭、超时、未知类型/正文超长；不落错误账号数据。超时关闭并等待对应原动作结束，其他站点动作最大并发 `expect(maxConcurrent).toBe(1)`。同步失败保留已有列表并返回固定错误类别。
- [ ] **Step 5: 提交。** `feat: coordinate conservative comment synchronization`。

### Task 3: 回复核对、单次发送与不确定结果恢复

**Files:** 扩展 `desktop/comments/store.ts`、`adapter.ts`、`service.ts`；创建 `tests-desktop/comments-replies.spec.ts`。

**Interfaces:** 适配器增加 `observeReplyTarget(page,review):Promise<{observation:CommentObservation,comment:CommentRecordInput|null}>`（同次观察返回当前源评论、身份和能力）；`CommentObservation`是任务2 observe返回类型。`prepareReply(page,review,signal):Promise<void>`（不点发送）、`submitReply(page,review):Promise<CommentReplyReceipt|null>`、`readReplyResult(page,attempt):Promise<CommentReplyReceipt|null>`、`commentUrl(comment):string|null`。服务增加 `reviewCommentReply({commentId}):Promise<CommentReplyReview>`、`sendCommentReply({reviewId}):Promise<CommentDetails>`、`recheckCommentReply(commentId):Promise<CommentDetails>`、`recordCommentReplyCheck({commentId,attemptId,result:'found'|'not_found',note}):CommentDetails`、`openCommentPage(commentId):Promise<void>`。

- [ ] **Step 1: 写失败测试。** `comments replies bind exact source and draft revisions`：核对含完整源文和回复、作品/线程/评论/稳定作者标识、真实身份；5分钟到期、改草稿、源文改变、评论removed/unsupported、prepare后换号均 `expect(submitCalls).toBe(0)`。延迟目标观察时换号或切换到同昵称的另一评论，也不得准备/发送。默认禁用适配器的所有回复方法均拒绝，无正式注入开关。
- [ ] **Step 2: 运行 RED。** `npm run test:desktop -- --grep 'comments replies'`；应缺少确认和回复事务。
- [ ] **Step 3: 实现事务及完整目标复核。** 存储增加 `reserveReply(review):CommentReplyAttempt`、`beginReplySubmit(attemptId):void`、`finishReply(attemptId,outcome):void`、`recordReplyReceipt(attemptId,receipt):void`。尝试保存不可变 review，reviewId 唯一，阶段 reserved/submit_intent/finished，结果 none/not_sent/sent/review；同评论已有 sent 或未核对结果不能普通再发。reserve 前及 marker 前核对草稿/源文修订和完整目标；准备回复之前和发送marker之前都通过observeReplyTarget核实完整目标、源文和实时身份/context/能力；最后这次观察之后不再等待其他读取，立即持久记录意图再submit。submitReply本身也只作用于review绑定的精确评论目标，目标不在当前页面时拒绝，不能点击“当前打开的任意回复框”。renderer 只能传 reviewId。既有保存/处理入口不能修改尝试快照；reserved/submit_intent期间拒绝草稿修改，改动本地草稿绝不能清除sent/review状态。
- [ ] **Step 4: 验证结果、退出与去重。** `comments replies quarantine ambiguous outcomes without resending`：连续发送同 reviewId 只一次 submit，保存回执必须完整匹配账号/作品/线程/评论/作者和唯一回复ID，拒绝跨尝试复用；null、页面仅“成功”、异常、超时都 review，不自动重发。重启 marker前→failed（明确未发送）、marker后→review，不执行队列。人工found仍review，not_found仅允许新核对；readReplyResult 从不submit。已sent不再普通发送。关闭前未marker可中止；marker后等待调用结束，超时先记review、关context、等动作结束再释放队列。评论入口初始仅接受无凭据、默认端口、无query/hash的 creator.douyin.com HTTPS；没有实测入口返回明确不可用。
- [ ] **Step 5: 提交。** `feat: confirm individual comment replies and recover uncertain results`。

### Task 4: 不丢输入的草稿控制器与受限 IPC

**Files:** 创建 `src/comments/CommentDraftController.ts`、`tests-desktop/comments-drafts.spec.ts`；修改 `shared/desktop-contracts.ts`、`desktop/ipc.ts`、`desktop/preload.ts`、`desktop/main.ts`、`src/desktop-entry.tsx`、`src/App.tsx`（仅桌面导航离开保护）。

**Interfaces:** DesktopApi 按名称暴露任务2/3的全部业务方法，均 Promise，不暴露 service.close。`CommentDraftController(api)` 提供 `load(commentId):Promise<void>`、`edit(text):void`、`flush():Promise<void>`、`flushAll():Promise<void>`、`snapshot()`（commentId、text、revision、dirty、saving、error），以及订阅接口；控制器在桌面根组件存活。主进程退出协议仅含 `registerCommentDraftFlush():Promise<void>`、`onCommentDraftFlush(listener:(requestId:string)=>void):()=>void`、`completeCommentDraftFlush({requestId,ok}):Promise<void>`；token由主进程生成且绑定当前窗口，不能传任意事件名。

- [ ] **Step 1: 写失败测试。** `comments drafts retain edits across delayed saves and failed navigation`：停止输入500ms后保存；保存旧文本时继续输入，旧响应不得覆盖新文本；两账号切换隔离。保存被拒/修订冲突时源输入保留，选择评论、账号筛选、页码、搜索导致选中项变化或离开消息页都先等待flush，失败仍停留。成功后仅显示DB确认的修订。
- [ ] **Step 2: 运行 RED。** `npm run test:desktop -- --grep 'comments drafts'`；应缺少控制器和退出协议。
- [ ] **Step 3: 实现显式保存边界。** 每条评论独立缓冲及请求序号、CAS修订；save期间新输入排下一次保存，不重置textarea。空草稿支持清空，无变化不重复写。App内页面切换/筛选同走flush保护；删除或源文变更不偷偷丢草稿。useEffect卸载不能作为唯一保存机制，不新增本地消息缓存冒充DB成功。
- [ ] **Step 4: 实现并验证正常退出。** 窗口close与app before-quit在进入服务清理前请求已注册renderer flushAll；只在当前requestId得到成功后继续，错误或5秒无回应取消此次关闭并保留窗口，不自动丢弃输入。未注册且尚未可编辑的启动窗口沿用原关闭。测试输入后立刻退出再开保留末次文字；保存失败窗口仍开且文字仍在，恢复后退出成功。OS强制终止不承诺保存尚未入库的500ms输入；已有DB草稿始终保留。旧发布/素材导入退出测试仍通过；所有新增IPC拒绝子框架、错窗口、多余字段、未知ID与伪造token。
- [ ] **Step 5: 提交。** `feat: flush account comment drafts before navigation and shutdown`。

### Task 5: 评论工作台、完整确认与结果核对界面

**Files:** 创建 `src/comments/DesktopCommentsPage.tsx`、`CommentDetails.tsx`、`CommentReplyReviewDialog.tsx`、`useComments.ts`、`tests-desktop/comments-ui.spec.ts`；修改 `src/App.tsx`、`src/styles.css`。复用现有对话框焦点工具，不拆改无关页面。

**Interfaces:** 页面消费 CommentWorkspace/CommentDetails、根级草稿控制器和具名 DesktopApi。useComments 提供带请求序号的列表/详情刷新与错误隔离。概览和账号卡片调用 getCommentSummary，桌面不再用空的演示 messages 数组推断真实评论数量。

- [ ] **Step 1: 写失败测试。** `comments UI distinguishes unsynced failure empty and filtered lists`：真实桌面初次无示例，明确“评论读取待验证”；同步失败保留原记录及失败说明，成功空结果、无匹配筛选、未同步分别显示。账号+本地处理状态+文字搜索组合正确；同名作者的作品/评论归属始终可见。
- [ ] **Step 2: 运行 RED。** `npm run test:desktop -- --grep 'comments UI'`，应缺少桌面评论页。
- [ ] **Step 3: 实现已确认的三列界面。** 左账号、中评论列表、右源评论与回复区；不足1200px详情抽屉，窄窗保留账号/作者/作品。顶部区分“评论读取待验证”“评论回复待验证”；私信显示阶段C尚未接通，不出现假的0条已同步私信。保存与标记已处理始终标本地；详情显示发送中、已发送、结果待核对、失败和脱敏事件。人工记录与官方结果分别标注。暂停/离开发布页不阻止只读结果核对进入共享队列。
- [ ] **Step 4: 验证交互与可访问性。** `comments UI retains drafts and prevents stale recipient actions`：延迟A详情后选B不串号；快速点击同次确认不重复；确认弹层含完整源文、全文回复、目标账号和唯一归属；编辑后重新核对；未验证正式适配器按钮禁用。脚本/HTML评论按文本展示，站外链接不在特权窗口导航。保存失败不清输入；同步刷新不覆盖dirty输入。1440/1280/960无整页横向溢出，弹层/抽屉Tab/Escape/关闭焦点返回。结果待核对持续刷新到已核实结果，不需导航。跑原HTML演示、发布与桌面全套测试。
- [ ] **Step 5: 提交。** `feat: add account-owned comments workspace and reply review UI`。

### Task 6: Windows 打包回归、真实站点门槛与交付

**Files:** 创建 `docs/comments-stage-b-delivery.md`、`docs/windows-comments-acceptance.md`；修改 `README.md`、`tests-desktop/packaging.spec.ts`、`package.json`、`package-lock.json`（版本0.4.0，依赖不变）；仅在有真实证据时新增 `desktop/comments/douyin-adapter.ts`。

**Interfaces:** 真实适配器实现任务2/3的全部契约；正式main静态选择经实测的能力实现，否则一直为UnverifiedCommentsAdapter。不得用test flag或数据库logged_in伪装启用。版本构建标签为 `desktop-build-0.4.0`，只在最终验证并推送后请求一次。

- [ ] **Step 1: 确认官网证据前提。** 只读检查页面可达性；Windows自有账号验证稳定身份、作品/线程/评论/作者标识、分页范围、准备控件、独立发送控件及唯一回复回执。读取与回复分别验收，发布通过不能代替。失败时不编造DOM，记录“未执行真实读取/回复”，继续离线独立验收。
- [ ] **Step 2: 有证据才实现真实适配器。** 先写脱敏最小页面夹具RED，再接真实解析与单条操作；未知格式/改版/删除/已发送结果不明确时停止，不能按文字或昵称猜测。每条测试回复由用户在自己的Windows官方窗口确认，是否保留/删除由用户决定；不上传凭据、消息或用户截图到仓库。
- [ ] **Step 3: 完整回归与打包。** 运行 `npm test -- --reporter=list`、`npm run test:desktop`；Linux测试器独占Xvfb98，不并发启动两次。构建Linux dir，在独立DISPLAY运行 `npm run test:packaged`，覆盖schema2含发布回执→3、草稿、未知回复及重启不重发。Windows原生工作流运行全套、NSIS、实际打包版迁移/重启；POSIX ACL测试不能冒充Windows权限验证。没有成功运行与实际产物就不提供安装包下载链接。
- [ ] **Step 4: 独立审阅与一次集中修复。** 按执行技能对本阶段整个范围做一次新鲜整体审阅，附上本计划、原设计、全部Review Focus和Rulings；经确认的重要问题先RED再修复，完整回归与受影响打包重跑。Minor只记录延期，不开启无限循环。交付记录分别列明本地核心、评论真实读取、评论真实发送、Windows安装和私信的状态。
- [ ] **Step 5: 提交并推送。** 实际桌面截图仅来自正式默认禁用适配器及明确本地测试档案；不混入用户消息。推送源码、截图、验收和全部裁定/代价到my-project；保留旧HTML演示包并同步最新导出。按需请求新版本Windows构建，API受阻则诚实报告无法确认结果，不反复推标签。

## 计划自查与执行交接

已对照总设计§6—8：账号/类型隔离、稳定目标、同步失败保留、范围/状态、500ms草稿与导航/退出保存、逐条确认、内容/身份变化失效、提交标记、未知结果、人工核对、只读入口、审核边界及Windows验证均有具体责任任务。五类Review Focus均已落入对应失败测试。阶段C私信与自动化批量回复不属于本次。

沿用用户选择的native执行，不再询问代理/工作树/技术栈。此计划已获用户确认并完成六项实施任务；最终验证、独立审阅、全部裁定与延期Minor见[阶段B交付记录](../../comments-stage-b-delivery.md)。真实读取/发送仍按计划保留禁用门槛。
