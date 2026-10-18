# Publishing Stage A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. The user has already selected native execution; do not ask them to choose an execution method again.

**执行记录（2026-10-18）：** 任务 1—5 已实现，任务 6 的离线打包、截图和独立复查已完成；官方站点代理 403，Windows 原生安装与真实发布未执行，生产适配器继续禁用。详见 [本阶段交付记录](../../publishing-stage-a-delivery.md)。

**Goal:** 在现有 Windows 桌面版中实现发布准备、逐任务确认、串行执行与中断恢复；只有真实站点能力经过验证后才启用远端发布。

**Architecture:** 保留现有 Electron、SQLite 与受限 IPC，将发布存储、站点适配、操作协调和桌面发布页分别拆为独立模块。发布确认绑定任务修订、素材指纹和当前账号身份，提交前持久记录意图；结果不确定时暂停批次并禁止自动重发。

**Tech Stack:** 沿用 Node.js 24、Electron 44.9.0、better-sqlite3 13.0.3、Playwright Core 1.64.1、React 19.3.1、TypeScript 7.0.2、Vite 8.3.4；本期不增加产品依赖。SQLite 使用已验证的 npm 包内 Node-API 模块，不强制重新编译。

**Spec:** `docs/superpowers/specs/2026-10-17-publishing-and-inbox-experience-design.md`，实现其中阶段 A；评论和私信的存储、同步与发送留给各自的独立计划。

## Global Constraints

- “创建本地任务与启动远端发布是两个独立动作。”
- “原素材后续修改不覆盖已保存的任务信息；编辑任务会生成新修订版本。”
- “任务修订、实际视频指纹或目标身份变化后，本次确认失效，要求重新核对。”
- “每次写入前重新检查实时身份与已确认目标一致，不能把历史登录记录作为本次依据。”
- “全局同一时间只执行一项站点操作，包括发布、消息同步和回复发送。”
- “写入意图已记录后的任务不再显示‘取消发布’，改为‘停止后续任务’和‘核对结果’。”
- “重启不自动执行队列。”
- “已提交 · 审核中”与“已发布”分别显示，人工记录不能冒充自动核实。
- “当前云端站点访问受阻，不能编造页面选择器或把设计稿当作接入验收。”
- 沿用现有隔离工作区与 `preview/xumu-demo` 分支，不创建 worktree，不修改浏览器管理策略，不把会话或用户素材提交到 Git。
- 保留 HTML 演示；桌面版不出现虚构数据或“演示发布成功”。窗口最小 960 × 700；宽度不足 1200 时详情改为抽屉，确认弹层可用键盘操作。
- 一次发布清单最多 100 个不同任务。确认清单有效期 5 分钟；这是本期产品默认值，不代表站点授权有效期。

## Review Focus

1. 数据库迁移时原库含 WAL、旧任务或事件：保留所有记录，备份失败不开始迁移，迁移失败不删除原数据。任务 1。
2. 用户核对后修改文案、恢复素材或切换浏览器账号：按修订、指纹和实时身份重新检查，旧确认不能启动变化后的任务。任务 3、4。
3. 连续点击启动、多个窗口请求以及退出与提交并发：同一确认只建立一次批次，同一时刻只有一个站点动作；关闭发生在提交标记之后即按待核对恢复。任务 4。
4. 页面提示成功但缺少唯一作品标识、审核中、同标题历史作品：不把它们混为已发布，不依据标题猜测匹配，不自动重试。任务 3、4。
5. 新功能使旧界面类型或缓存失效、核对弹层漏列阻塞任务：桌面显示真实原因，旧 HTML 演示仍可用，错误不清空用户输入。任务 5。

---

## 范围与交付条件

任务 1—5 可在离线夹具与实际 Electron 中交付发布核心和真实的未接通状态。任务 6 包含站点实测：若仍无法访问官方页面或没有 Windows 实机登录条件，则交付 Windows 验证步骤并保留禁用适配器，不把本阶段称为“真实发布已接通”。

不增加无人值守定时发布、自动回复或批量私信。不要求用户把密码、Cookie、二维码或浏览器配置提交到聊天或仓库。

## 文件与接口约定

| 文件 | 职责 |
| --- | --- |
| `shared/publishing-contracts.ts` | 可序列化发布 DTO、确认输入和事件视图 |
| `desktop/storage/migrations.ts` | 备份及 schema 1 → 2 迁移 |
| `desktop/storage/publish-store.ts` | 发布任务、尝试、批次、事件与恢复事务 |
| `desktop/publishing/adapter.ts` | 内部站点适配接口与明确禁用的默认实现 |
| `desktop/publishing/coordinator.ts` | 单一站点操作队列、暂停及退出协调 |
| `desktop/publishing/service.ts` | 核对、确认、身份验证、执行与结果核对 |
| `src/publishing/DesktopPublishingPage.tsx` | 桌面任务列表与筛选，替换桌面专用内联页面 |
| `src/publishing/PublishReviewDialog.tsx` | 完整清单与逐任务文案核对 |
| `src/publishing/PublishTaskDetails.tsx` | 结果、事件时间线和人工核对 |
| `src/publishing/usePublishing.ts` | 异步业务调用、刷新和过期响应隔离 |
| `tests-desktop/publishing-*.spec.ts` | 实际主进程的存储、服务和 UI 验证 |
| `docs/windows-publishing-acceptance.md` | 原生 Windows 与真实发布验证记录 |

共享类型在任务 1 创建，后续名称固定：

```ts
type PublishStatus = 'pending' | 'waiting_login' | 'running' | 'submitted'
  | 'published' | 'rejected' | 'failed' | 'review' | 'cancelled';
type PublicationReceipt = {
  remoteWorkId: string; accountRemoteId: string; officialUrl: string;
  state: 'pending_review' | 'published' | 'rejected' | 'restricted';
  observedAt: string;
};
type PublishDraftInput = {
  taskId: string; expectedRevision: number;
  title: string; description: string; tags: string[];
};
type PublishReviewRow = {
  taskId: string; revision: number; accountId: string; assetId: string;
  assetSha256: string; title: string; description: string; tags: string[];
  identity: Identity | null; contextId: string | null;
  blockers: { code: string; message: string }[];
};
type PublishReview = {
  id: string; createdAt: string; expiresAt: string;
  rows: PublishReviewRow[]; readyTaskIds: string[];
};
type PublishBatch = {
  id: string; reviewId: string; taskIds: string[];
  state: 'running' | 'paused' | 'completed';
};
type PublishEvent = {
  id: number; taskId: string; attemptId: string | null;
  kind: string; summary: string; createdAt: string;
};
type PublishTaskDetails = {
  task: DesktopTask; events: PublishEvent[];
  latestAttemptId: string | null;
  manualCheck: { result: 'found' | 'not_found'; note: string; createdAt: string } | null;
};
```

`Identity` 沿用原共享定义。`DesktopTask` 保留原字段，状态使用 `PublishStatus`，新增 `revision: number`、`description: string`、`tags: string[]`、`assetSha256: string`、可选 `receipt: PublicationReceipt` 与可选 `repostOf: string`。路径、页面对象与底层 SQL 不进入 DTO。

内部 `AttemptRecord` 在 `publish-store.ts` 定义：ID、任务 ID、批次 ID、确认修订、目标远端身份、contextId、阶段（reserved/preparing/submit_intent/finished）、结果（none/not_submitted/submitted/review）、回执与创建时间。所有 ID 使用现有 UUID v4 校验。

### Task 1: 保留旧数据的发布存储与状态恢复

**Files:** 创建 `shared/publishing-contracts.ts`、`desktop/storage/migrations.ts`、`desktop/storage/publish-store.ts`、`tests-desktop/publishing-storage.spec.ts`；修改 `shared/desktop-contracts.ts`、`desktop/storage/repository.ts`、`desktop/validation.ts`。

**Interfaces:** `migrateDatabase(db: Database.Database, dataDir: string): void`；`PublishStore(db: Database.Database)` 提供 `listTasks(): DesktopTask[]`、`getDetails(taskId): PublishTaskDetails`、`createTasks(input: CreateTasksInput): DesktopTask[]`、`updateDraft(input: PublishDraftInput): DesktopTask`、`cancelTask(taskId): void`、`recoverInterrupted(): void`。Repository 在建库后持有 `publishing: PublishStore`，原任务方法委托它；账号和素材接口保持原样。

- [x] **Step 1: 写迁移与修订失败测试。** 在实际 Electron 主进程中创建 schema 1 的账号、素材、pending/cancelled 任务和事件，包含非空 WAL；迁移后断言 `expect(result.ids).toEqual(oldIds)`、`expect(result.revisions).toEqual([1,1])`、`expect(result.eventsPreserved).toBe(true)`。修改素材标题不得改变任务标题；正确修订编辑一次后 `expect(next.revision).toBe(2)`，旧 expectedRevision 再次编辑必须拒绝。
- [x] **Step 2: 运行 RED。** `npm run test:desktop -- --grep 'publishing storage'`；应因新存储或迁移不存在失败，不把启动环境错误当作预期 RED。
- [x] **Step 3: 实现迁移与事务。** 迁移前用 SQLite 一致性序列化写唯一备份，权限 0600；不能简单复制可能缺 WAL 的主文件。重建 tasks 表以扩展 CHECK，保留 task_events 外键与事件 ID，新增 publish_batches、publish_attempts、publish_manual_checks。旧任务补 revision=1、description=''、tags=[] 和素材指纹。关闭外键仅覆盖受控迁移，事务内在重建后检查 foreign_key_check，失败回滚；finally 恢复外键。新库直接建立 schema 2，版本大于 2 拒绝写入。编辑仅允许 pending/failed 且尚未提交的任务，title 1—100、description 0—2000、tags 最多 10 项且每项 1—30；这些是本地约束，站点限制另行验证。
- [x] **Step 4: 验证失败路径。** 备份位置不可写、故意违反外键、迁移中抛错均拒绝启动写入，原库可读且记录不丢；未来 schema 文件字节保持不变；foreign_keys 仍开启。迁移前 pending/cancelled 的读取与原测试相同。运行上述测试及原 `storage.spec.ts` 全部通过。
- [x] **Step 5: 提交。** `git commit -m "feat: persist publishing revisions and recoverable attempts"`。

### Task 2: 发布尝试与批次的原子事务

**Files:** 扩展 `desktop/storage/publish-store.ts`，创建 `tests-desktop/publishing-attempts.spec.ts`。

**Interfaces:** 新增 `reserveBatch(reviewId: string, rows: PublishReviewRow[]): PublishBatch`、`beginPreparation(attemptId): void`、`beginSubmit(attemptId): void`、`finishAttempt(attemptId, outcome): void`、`recordReceipt(attemptId, receipt: PublicationReceipt): void`、`pauseBatch(batchId): PublishBatch`、`getBatch(batchId): PublishBatch`、`getAttempt(taskId): AttemptRecord | null`、`recordManualCheck(input): PublishTaskDetails`、`createRepostDraft(input): DesktopTask`。outcome 仅为 `{ kind:'not_submitted'|'review'; errorCode:string }`。人工输入为 taskId、attemptId、result（found/not_found）、note（0—1000）。重发草稿输入为 previousTaskId、expectedRevision、acknowledged（必须 true）。

- [x] **Step 1: 写原子性与恢复测试。** 同 reviewId 两次预留断言 `expect(second.id).toBe(first.id)`、每个任务仅一个有效尝试；修改修订后整个批次预留失败，零个新尝试。分别在 reserved、preparing、submit_intent 后关闭并重开数据库，断言任务状态为 `['pending','pending','review']`，批次全部 paused，没有自动执行。
- [x] **Step 2: 运行 RED。** `npm run test:desktop -- --grep 'publishing attempts'`；应缺少尝试事务方法。
- [x] **Step 3: 实现状态机。** 批次以 reviewId 唯一去重；预留、确认快照和尝试原子写入。只允许 reserved → preparing → submit_intent → finished；beginSubmit 同事务写持久事件后才返回。取消只适用于未开始或 reserved 的任务；进入 submit_intent 后拒绝取消。恢复与结果核对都追加事件，不覆盖历史。错误摘要只使用固定错误类别，不保存原始页面文本或凭据。
- [x] **Step 4: 实现结果约束。** 回执账号必须匹配尝试目标；作品 ID 已知后，后续回执必须是同一作品。存储层只接受非空作品 ID、合法时间及 HTTPS 官方 URL，无用户信息或外域跳转；初始主机集合仅含已知官方 creator.douyin.com，实际作品域名或路径只能由任务 6 的证据扩展。pending_review → submitted，published → published，rejected/restricted → rejected。同标题不是唯一证据。人工 found 保持 review 并显示人工标记；not_found 不自动执行，只有后续新的核对确认可建立新尝试。已提交历史不能被普通 createTasks 或重试绕过；新重发草稿只允许来源 published/rejected 且 acknowledged=true，保留 repostOf，仍需新确认。对 submitted/review 禁止重发草稿。测试 `expect(manual.task.status).toBe('review')` 与 `expect(repost.repostOf).toBe(previous.id)`。
- [x] **Step 5: 运行 GREEN 并提交。** attempts、storage 及原存储测试通过后提交 `feat: make publishing attempts idempotent and crash recoverable`。

### Task 3: 当前账号页面、能力观察与默认禁用适配器

**Files:** 创建 `desktop/publishing/adapter.ts`、`desktop/publishing/coordinator.ts`、`tests-desktop/publishing-boundaries.spec.ts`；修改 `desktop/browser/session-manager.ts`、`desktop/media/library.ts`。

**Interfaces:** SessionManager 新增 `withAccountPage<T>(accountId: string, action: (page: Page, contextId: string) => Promise<T>): Promise<T>`，每次新 context 使用新 UUID，关闭后失效；不把 Page 暴露到 preload。MediaLibrary 新增内部 `verifiedPath(assetId: string, expectedSha256: string): Promise<string>`，先校验受管路径、可读性与实际指纹，返回值只留在主进程。Coordinator 提供 `run<T>(work: () => Promise<T>): Promise<T>`、`close(): Promise<void>`，关闭后拒绝新动作。批次暂停由服务检查批次状态实现，不锁住只读核对或重新登录。

内部 PublishAdapter 方法固定：

- `observe(page: Page): Promise<{ identity: Identity | null; canPublish: boolean; version: string; reason?: string }>`
- `prepare(page: Page, input: { file: string; title: string; description: string; tags: string[] }, signal: AbortSignal): Promise<void>`
- `submit(page: Page): Promise<PublicationReceipt | null>`
- `readResult(page: Page, attempt: AttemptRecord): Promise<PublicationReceipt | null>`

适配器另有只读属性 `worksUrl: string | null`；默认 null，只有经过实测的官方作品列表入口才赋值。操作只在服务或 IPC 最外层获取一次 coordinator，withAccountPage 内不再次排队，避免嵌套等待。

- [x] **Step 1: 写边界测试。** 用既有实际 Chromium + 本地页面夹具，两个账号 contextId 不同，关闭重开同账号获得新 ID；观察不到身份或能力时没有 prepare/submit 调用。串行启动两个延迟动作，断言 `expect(maxConcurrent).toBe(1)`。素材在核对后被修改应拒绝 verifiedPath；同指纹修复后的副本可以使用新受管路径。
- [x] **Step 2: 运行 RED。** `npm run test:desktop -- --grep 'publishing boundaries'`；应缺少新边界接口。
- [x] **Step 3: 实现主进程边界。** withAccountPage 复用原配置，页面不存在时返回可识别错误；contextId 与账号映射只由主进程生成。操作队列不提供任意脚本接口，登录核实动作与发布页面导航也经过同一协调器。默认 UnverifiedPublishAdapter 的 observe 返回 canPublish=false 和原因，其他方法明确拒绝；它不能因持久化 logged_in 或环境变量而启用。
- [x] **Step 4: 验证 GREEN。** 模拟同一账号切换身份、context 关闭、排队期间退出、缺少浏览器，均不写入远端；测试适配器只由测试中的内部依赖注入，不添加产品开关或 preload 注入通道。
- [x] **Step 5: 提交。** `git commit -m "feat: isolate publication capability and account operation boundaries"`。

### Task 4: 核对清单、执行、暂停与结果复核

**Files:** 创建 `desktop/publishing/service.ts`、`tests-desktop/publishing-service.spec.ts`；扩展 publish-store 的事件查询，保持所有写入由已定义事务完成。

**Interfaces:** `PublishingService(store, repository, media, sessions, coordinator, adapter, now?: () => number)` 提供 `reviewPublish(input: { taskIds: string[] }): Promise<PublishReview>`、`startPublish(input: { reviewId: string }): Promise<PublishBatch>`、`pausePublishing(batchId): Promise<PublishBatch>`、`getPublishingBatch(batchId): PublishBatch`、`getPublishTaskDetails(taskId): PublishTaskDetails`、`recheckPublish(taskId): Promise<PublishTaskDetails>`、`openPublishPage(taskId): Promise<void>`、`recordPublishCheck(input): PublishTaskDetails`、`close(): Promise<void>`。草稿编辑与重发方法使用任务 1、2 的输入，服务额外校验素材可用。openPublishPage 在该账号上下文中打开已验证回执 URL 或 worksUrl；都不可用时明确拒绝并显示入口待验证，不把创作者首页假称作品页。

- [x] **Step 1: 写核对测试。** 三个任务分别为就绪、未登录、素材缺失，断言 `expect(review.rows).toHaveLength(3)` 且 readyTaskIds 只有一个；默认适配器下所有行有“发布接入待验证”阻塞。用注入时钟推进到 5 分钟后，startPublish 拒绝；任一就绪项修订或指纹变化时本次启动整体拒绝，不能悄悄发布剩余项。
- [x] **Step 2: 运行 RED。** `npm run test:desktop -- --grep 'publishing service'`。
- [x] **Step 3: 实现确认与执行。** taskIds 必须为 1—100 个不同且存在的 UUID，重复、未知或非数组输入拒绝；清单保留输入顺序。核对 ID 在主进程保存不可由 renderer 改写的完整清单，5 分钟期限从清单生成完成时开始；启动只接受 reviewId，renderer 不能传入“已核实身份”或替换行。过期前重复启动返回同批次。启动原子预留后逐条执行；prepare 前与 beginSubmit 前分别重新观察实时身份、能力版本及 contextId，并检查当前素材指纹。检查成功后先写 beginSubmit，再调用 submit。历史身份或旧能力观察不替代实时检查。
- [x] **Step 4: 实现错误与暂停。** submit_intent 之前可证明未提交的失败记 not_submitted；marker 之后异常、null 回执或无法唯一关联的结果一律 review，立即暂停整个批次。pause 只阻止后续任务，不能清除提交标记；暂停时只读 recheck 仍可进入全局串行队列。退出先停止调度，未提交阶段请求中止，提交阶段等待已开始调用返回或其已验证超时，再保留可恢复状态，不关闭数据库在前。超时不能仅用 Promise.race 留下仍会写入的后台操作：持久记录不确定结果后关闭该账号上下文，确认动作已结束才能释放操作队列。默认未验证适配器不存在远端调用。
- [x] **Step 5: 写关键回归并运行 GREEN。** 连续启动仅一次 submit；第一条不确定时第二条 submit 为 0；平台仅提示“成功”但无回执仍 review；pending_review 显示 submitted；readResult 不调用 submit；人工记录不产生 published；暂停后可用新核对排除 review 再恢复其他任务；账号在 prepare 后变化时 submit 为 0。所有服务与边界测试通过后提交 `feat: coordinate confirmed publishing with conservative result recovery`。

### Task 5: 接入已确认的发布界面与受限 IPC

**Files:** 创建 `src/publishing/DesktopPublishingPage.tsx`、`src/publishing/PublishReviewDialog.tsx`、`src/publishing/PublishTaskDetails.tsx`、`src/publishing/usePublishing.ts`、`tests-desktop/publishing-ui.spec.ts`；修改 `desktop/main.ts`、`desktop/ipc.ts`、`desktop/preload.ts`、`shared/desktop-contracts.ts`、`src/App.tsx`、`src/data.ts`、`src/styles.css`。不拆改与发布无关的页面。

**Interfaces:** DesktopApi 逐一暴露任务 4 的具名业务方法（不暴露 close），同步读取也包装为 Promise；另加 `updatePublishDraft(input: PublishDraftInput): Promise<DesktopTask>` 与 `createRepostDraft(input): Promise<DesktopTask>`。registerIpc 扩展参数为 window、repository、media、sessions、publishing、coordinator；open-account、connection 和 close-account 的整次动作也经过 coordinator，服务内部不重复获取它。全部 IPC 继续验证当前窗口主框架和拒绝多余字段，禁止 renderer 指定结果状态或伪造回执。getSnapshot 返回新版真实任务，usePublishing 使用请求序号隔离过期响应；描述、标签、修订字段仅桌面任务必填，旧 HTML 演示继续使用原数据验证和演示行为。

- [x] **Step 1: 写 UI 失败测试。** 实际 Electron 中创建账号与视频，进入发布页编辑该账号文案、刷新后仍保留。打开核对清单必须显示所有阻塞项、目标身份与完整文本；正式默认适配器下确认按钮禁用且显示具体原因，没有虚构成功状态。服务错误后输入保留，连续点击不创建重复批次。
- [x] **Step 2: 运行 RED。** `npm run test:desktop -- --grep 'publishing UI'`。
- [x] **Step 3: 接入页面。** 按已提交的三张效果稿中的发布与恢复两张布局实现，桌面任务从 App 内联页抽出，保留原 HTML 演示页。详情展示 submitted/review/published 等真实状态、脱敏时间线、官方页面入口和人工核对。人工 found 标明“人工记录已找到”，不能显示自动已发布；not_found 后新启动必须再次完整确认。平台能力未接通时编辑和本地保存可用，远端启动不可用。
- [x] **Step 4: 完成窗口与键盘验证。** 在 1440 × 1000、1280 × 900、960 × 700 验证无整页横向溢出；不足 1200 时详情使用抽屉，焦点可进入、关闭后返回触发项。确认弹层键盘循环和 Escape 有效，长文案不被截断，标签和消息正文按文本显示。更新桌面状态类型时运行旧演示 10 项测试，不能把真实 submitted 状态写进演示缓存。
- [x] **Step 5: 回归并提交。** `npm test` 与 `npm run test:desktop` 完整通过后提交 `feat: connect publication review and recovery desktop screens`。截图必须取自实际桌面，不以静态设计稿冒充实现结果。

### Task 6: 真实站点能力验证、Windows 构建和交付记录

**Files:** 创建 `docs/windows-publishing-acceptance.md`；更新 `README.md`、`docs/desktop-foundation-delivery.md` 或新增本阶段独立记录、`tests-desktop/packaging.spec.ts`、`.github/workflows/windows-build.yml`。只有取得真实证据时才创建 `desktop/publishing/douyin-adapter.ts` 并完善 `desktop/browser/douyin.ts`。

**Interfaces:** 验证后的适配器实现任务 3 的全部接口；与当前浏览器 context、远端身份、固定官方域名和已验证页面版本绑定。未验证时 main 继续选用 UnverifiedPublishAdapter；不得通过配置伪造 canPublish=true。

- [x] **Step 1: 检查官方页面前提。** 仅做读操作确认可访问性，分别记录身份依据、上传与提交控件、官方回执及作品结果。若站点仍受阻，明确记录“未执行真实发布”，保留默认禁用适配器，继续独立的打包与离线验证，不编造 DOM 选择器。
- [x] **Step 2: 仅在证据可用时接入适配器。** 先基于去除敏感内容的最小页面夹具写失败测试，再实现已核实的身份观察、prepare、submit 和只读结果检查。仅接受准确的作品标识及预期账号；URL 必须为实测官方 HTTPS 主机、无用户信息、无外域跳转，不能盲目打开任意回执链接。未知结果继续 review。
- [ ] **Step 3: Windows 逐步验收。** 用户在自己的 Windows 官方页面扫码并主动确认一条测试素材；验证提交、审核状态、作品结果，然后两个自有账号隔离与串行批次。再验证扫码中断、账号切换、提交前退出、提交后连接中断与手工核对。实际发出的测试内容和是否删除由用户在自己设备上决定；云端不代发。
- [ ] **Step 4: 打包与既有环境回归。** Linux 先运行实际 Electron 全部测试与打包版启动；Windows 原生工作流运行全套测试、NSIS 构建、打包版数据库迁移及重启。只有成功运行出现安装包产物后才提供对应下载链接，未签名状态如实记录。
- [x] **Step 5: 独立审阅和交付。** 代码完成后按执行技能做一次整体审阅，修复经确认的重要问题并重跑受影响测试。提交并推送源码、实际截图与交付记录到 my-project，必要时显式触发新的 Windows 构建标签。分别报告发布核心、真实身份、实际发布、Windows 安装、评论、私信的状态。

## 计划自查与执行交接

已将设计的发布准备、快照、确认失效、身份检查、单一执行、提交标记、暂停、审核区分、人工核对、重启、旧库迁移和窄窗口布局对应到任务 1—6。五类 Review Focus 均有指定失败测试。评论与私信的自动保存、去重和逐条发送不在本计划实现，留给阶段 B、C，避免遗漏被误称为完成。

用户此前已选择由当前会话直接开发；执行方式保持 native。按 writing-plans 流程，先评审这份新阶段实施计划，再沿用已选方式逐任务执行。当前文档没有宣称任务完成或真实站点已经接通。
