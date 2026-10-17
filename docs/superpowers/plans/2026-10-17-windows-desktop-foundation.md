# Windows Desktop Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认的序幕界面接入可运行的 Windows 桌面基础版本，持久保存真实本地数据，并为每个自有账号打开独立的官方登录浏览器。

**Architecture:** Electron 主进程管理 SQLite、受管媒体文件和 Playwright 浏览器上下文，受限 preload 仅暴露明确的业务操作。React 保留已确认的界面，通过桌面 gateway 读取和修改实际数据；原 HTML 演示单独保留。先完成桌面基础与账号连接，再为真实发布和评论、私信分别编写后续实施计划。

**Tech Stack:** Node.js 24、现有 React/TypeScript/Vite、Electron 44.9.0、better-sqlite3 13.0.3、electron-builder 26.15.3、playwright-core 1.64.1；新增依赖写入精确版本与锁文件。上述新增版本已通过 npm registry 查询，兼容性仍须在实际构建中验证。

**Spec:** `docs/superpowers/specs/2026-10-17-douyin-desktop-design.md`（用户已确认设计及效果演示）。

## Global Constraints

- “首要交付目标为 Windows 11 x64 桌面安装包；Windows 10 x64 的兼容性单独记录，不在未测试时宣称支持。”
- “初次启动显示真实空状态，不自动创建虚构账号、任务或未读消息。”原浏览器演示保留示例数据，桌面版不得导入它们。
- “渲染界面启用 contextIsolation，关闭 nodeIntegration，通过白名单 IPC 暴露具体操作，并在主进程校验参数、文件来源和账号归属。”
- “同一账号配置只允许一个活动浏览器上下文，账号切换不得共享配置目录。”
- “只有在观察到可验证的账号身份信息时才标记‘已登录’；仅页面打开或 URL 变化不够。”
- “首版支持 MP4 与 MOV 的本地导入”；实际媒体复制至 userData，下列文件位置不由渲染进程任意指定。
- 不导出 Cookie，不上传会话，不绕过验证；自动刷视频和模拟养号不在范围内。
- 使用当前隔离环境及现有分支，不创建 Git worktree，不重置用户文件，不把本地浏览器会话或测试账号推入 Git。

## Review Focus

1. 旧数据库存在、迁移失败或启动中断：保留原始数据，不因错误恢复成演示账号。由任务 2 测试。
2. 中文、空格文件名，重复内容，复制中断和路径逃逸：使用受管路径并保持文件与数据库一致。由任务 3 测试。
3. 浏览器缺失、重复点击登录、关闭窗口和多个账号同时打开：明确反馈，不共享配置或留下锁死记录。由任务 4 测试。
4. 页面结构变化、二维码仍未扫描、没有身份依据：保持待确认，不显示假登录成功。由任务 4 测试。
5. 快速连续保存和异步返回乱序：主进程事务完成后返回最新快照，不用旧界面快照覆盖数据库。由任务 2、5 测试。

## 本阶段边界

本计划交付桌面壳、本地账号档案、真实视频文件导入、本地任务队列、独立浏览器启动、连接状态，以及 Windows 构建与验收入口。桌面任务不会执行网页发布，消息列表无真实接入时显示空状态；演示运行按钮只出现在 HTML 演示里。

实际发布的账号核对、作品结果确认、断线后防重发仍是后续发布计划的必需内容。评论与私信读取、单条回复和结果确认由后续消息计划实现，不删除已确认的需求，也不把当前阶段标为完整软件交付。

## 文件结构与接口

| 文件 | 单一职责 |
| --- | --- |
| `shared/desktop-contracts.ts` | 序列化 DTO、参数与结果类型；无 Electron/Node 运行时依赖 |
| `desktop/main.ts` | Electron 生命周期、窗口及资源释放 |
| `desktop/preload.ts` | 通过 contextBridge 暴露 `window.xumu` 白名单 API |
| `desktop/ipc.ts` | 发送来源检查、输入校验、业务方法路由 |
| `desktop/storage/repository.ts` | SQLite 表、事务、迁移及快照 |
| `desktop/media/library.ts` | 原文件读取、流式复制、哈希和重复检测 |
| `desktop/browser/session-manager.ts` | 每账号独立 persistent context、并发保护及退出清理 |
| `desktop/browser/douyin.ts` | 固定官方目标页面与真实身份观察的边界 |
| `src/workspace/useWorkspace.ts` | 加载状态、业务命令与快照刷新 |
| `src/workspace/gateways.ts` | HTML 演示及桌面两种运行方式的适配 |
| `src/desktop-entry.tsx`、`desktop.html` | 桌面渲染入口，真实空状态 |
| `scripts/build-desktop.mjs`、`electron-builder.yml` | 主进程、preload 与 renderer 构建及打包 |
| `tsconfig.desktop.json`、`scripts/test-desktop.mjs` | 桌面代码编译及 Windows/Linux 测试启动差异 |
| `tests-desktop/`、`playwright.desktop.config.ts` | 真实 Electron 进程与本地文件验收 |
| `.github/workflows/windows-build.yml` | 手动触发的 Windows 构建与测试，上传 Actions 构建产物 |

共享接口固定为：

```ts
type LoginStatus = 'not_logged_in' | 'opening' | 'pending_confirmation' | 'logged_in' | 'expired';
type Identity = { remoteId: string; displayName: string; observedAt: string };
type LoginObservation = { accountId: string; status: LoginStatus; identity?: Identity; reason?: string };
type CreateAccountInput = { name: string; handle?: string; group: string };
type CreateTasksInput = { assetId: string; accountIds: string[]; title: string };
type ImportReport = { added: number; duplicates: number; failures: { filename: string; reason: string }[] };
```

`WorkspaceSnapshot` 是现有 `Workspace` 的桌面视图：现有 UI 字段保留，账号增加 `loginStatus` 与可选 `identity`，素材增加可选 `sha256`，数据全来自主进程；绝对路径只保存在主进程。SQLite `user_version` 与 UI 数据版本分别管理。`window.xumu` 仅包含下文列出的显式方法，不提供通用 invoke、SQL、文件路径读写或脚本执行接口。

## Task 1: 可启动的安全桌面窗口

**Files:** 创建 `shared/desktop-contracts.ts`、`desktop/main.ts`、`desktop/preload.ts`、`src/desktop-entry.tsx`、`desktop.html`、`tsconfig.desktop.json`、`scripts/build-desktop.mjs`、`scripts/test-desktop.mjs`、`electron-builder.yml`、`playwright.desktop.config.ts`、`tests-desktop/window.spec.ts`；修改 `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`。

**Interfaces:** 产生 `createDesktopWindow(): BrowserWindow`；preload 首先提供 `getRuntime(): Promise<{ mode: 'desktop'; version: string }>`。renderer 只能导入共享类型，不能导入 Electron 或 Node。

- [ ] 1. 写 `window.spec.ts`：真实 Electron 启动后显示中文窗口；`window.require` 不存在、`window.xumu.getRuntime()` 返回 desktop；关闭再启动仍正常。先运行 `npm run test:desktop -- --grep 'desktop window'`，确认缺少桌面入口导致失败。
- [ ] 2. 固定新增依赖；桌面 TS 配置输出 CommonJS 到 `dist-desktop/desktop/main.js` 和 `preload.js`，构建脚本生成 `dist-desktop/package.json` 标记 commonjs，防止根项目 type=module 改变加载语义。preload 不包含相对模块的运行时 require，只使用 Electron 白名单模块和已擦除的共享类型。Vite desktop 模式使用 `desktop.html`、base='./'，输出到 `dist-desktop/renderer`；HTML 演示仍使用现有 development 入口。打包后测试直接加载 renderer 文件，不依赖开发服务器。
- [ ] 3. 实现窗口：contextIsolation=true、nodeIntegration=false、sandbox=true；禁止渲染窗口导航至外站和任意新窗口，官方页面统一由浏览器服务处理。
- [ ] 4. 测试启动脚本在 Linux 使用 Xvfb，在 Windows 直接运行本地 Playwright CLI 并传递筛选参数；不在 Windows 调用 xvfb-run。在 Linux 准备 Xvfb 后运行上述真实 Electron 测试；缺少系统运行库时从受信任发行版安装，不关闭下载完整性或 TLS 校验。
- [ ] 5. 提交该任务，记录实际 Electron、Chromium 及 Node 版本。

## Task 2: SQLite 业务与受限 IPC

**Files:** 创建 `desktop/storage/repository.ts`、`desktop/ipc.ts`、`tests-desktop/storage.spec.ts`；修改任务 1 的共享契约与入口。

**Interfaces:** `Repository(dataDir: string)` 提供 `initialize(): void`、`snapshot(): WorkspaceSnapshot`、`createAccount(input: CreateAccountInput): Account`、`createTasks(input: CreateTasksInput): Task[]`、`cancelTask(taskId: string): void`、`close(): void`。preload 仅增加 `createAccount`、`createTasks`、`cancelTask` 的异步形式与 `getSnapshot(): Promise<WorkspaceSnapshot>`；不暴露初始化、关库或整个数据快照写入接口。

- [ ] 1. 写真实主进程测试：新库为空；创建账号并重启后仍存在且 `demo=false`；创建任务校验外键和重复的未完成映射；非法 IPC 来源/参数被拒；连续创建不丢记录。先运行 `npm run test:desktop -- --grep 'database|IPC'` 确认失败。
- [ ] 2. 建立 accounts、assets、tasks、task_events 与 schema migration；外键、写入与快照读取使用事务。账号身份及登录状态不允许 renderer 直接写入。
- [ ] 3. 迁移前备份数据库；模拟迁移失败时保留原文件并终止写入，显示可理解的启动错误；不得回填示例数据。
- [ ] 4. IPC 校验来自当前应用窗口主框架；ID 使用主进程生成的 UUID；账号名称 trim 后长度 1—30、抖音号不超过 50、分组 1—30、作品标题 1—100；校验枚举、账号和素材存在性，返回结构化业务错误。
- [ ] 5. 针对 Electron ABI 重建 better-sqlite3，在实际 Electron 主进程完成建库、写入、重启读取测试，通过后提交。

## Task 3: 真正管理本地视频文件

**Files:** 创建 `desktop/media/library.ts`、`tests-desktop/media.spec.ts`；修改 repository、IPC 与共享契约。

**Interfaces:** `MediaLibrary(dataDir: string, repository: Repository).importFiles(paths: string[]): Promise<ImportReport>`；preload 提供无路径参数的 `importVideos(): Promise<ImportReport>`，路径只来自主进程系统文件选择框；`updateAsset(assetId, { title, tag }): Promise<Asset>` 更新允许的元信息。

- [ ] 1. 写测试：中文和空格路径复制后可读；同内容不同文件名报告重复；不支持格式拒绝；读取/复制中断不留下有效素材行；目录逃逸与不安全链接拒绝；空文件不可用。先运行 `npm run test:desktop -- --grep 'media'` 确认失败。
- [ ] 2. 使用流式 SHA-256 和复制，临时文件完成后再原子落位；保存 UUID 受管相对路径，原视频无需一直留在导入位置。
- [ ] 3. 系统选择框仅选 MP4/MOV，并再次验证实际文件、大小和可读性；明确区分本地导入成功与平台格式验收。允许修改标题和分类，不允许 renderer 指定文件路径。
- [ ] 4. 故障回滚清理本次临时输出；不得删除已存在、被其他任务引用的素材。重启后检查媒体与数据库引用一致。
- [ ] 5. 运行媒体及数据库回归，通过后提交。

## Task 4: 每账号独立的官方登录浏览器

**Files:** 创建 `desktop/browser/session-manager.ts`、`desktop/browser/douyin.ts`、`tests-desktop/browser.spec.ts`；修改 repository、入口清理与 IPC。

**Interfaces:** `SessionManager(profileRoot: string, repository: Repository).open(accountId: string): Promise<LoginObservation>`、`close(accountId: string): Promise<void>`、`closeAll(): Promise<void>`；适配器 `observeIdentity(page: Page): Promise<Identity | null>`，Page 来自 playwright-core。本任务为 Repository 增加 `getAccount(id: string): Account | undefined`、`recordConnection(observation: LoginObservation): void`、`getConnection(id: string): LoginObservation`。preload 仅提供 `openAccount(accountId): Promise<LoginObservation>`、`closeAccount(accountId): Promise<void>` 与 `getConnection(accountId): Promise<LoginObservation>`。

- [ ] 1. 写测试：两个账号使用不同配置目录；同账号并发打开只创建一个 context；不存在账号拒绝；缺少 Chrome/Edge 给出指引；浏览器关闭释放状态；未观察到真实身份不能变成 logged_in。先运行 `npm run test:desktop -- --grep 'browser|identity'` 确认失败。
- [ ] 2. 发现 Windows Chrome/Edge 的受信任安装路径，使用 Playwright Core 的有界 persistent context 打开固定官方创作者页面；配置目录仅由主进程生成的账号 UUID 决定。
- [ ] 3. 登录由用户在真实站点扫码完成；先在可访问的官方页面核实身份依据再编写站点观察。若当前环境访问受阻或页面依据不足，返回 pending_confirmation 和原因，交付 Windows 验证步骤，不编造选择器或已登录结果。
- [ ] 4. 真实身份与既有绑定不一致时阻止标记成功；退出时关闭 context；不读取、导出或上传 Cookie，也不把账号档案备注当作身份依据。
- [ ] 5. 本地夹具仅测试边界、上下文隔离和失败处理；明确区分夹具验证与真实扫码验收，通过相应测试后提交。

## Task 5: 接通已确认的界面与真实数据

**Files:** 创建 `src/workspace/useWorkspace.ts`、`src/workspace/gateways.ts`、`tests-desktop/workspace.spec.ts`；修改 `src/App.tsx`、`src/data.ts`、`src/desktop-entry.tsx`、`src/styles.css`。

**Interfaces:** `useWorkspace(gateway)` 返回加载状态、最新 `WorkspaceSnapshot` 和任务 2—4 的明确业务命令。桌面 gateway 调用 `window.xumu`；原 HTML 演示 gateway 继续使用现有示例和 localStorage，数据互不迁移。

- [ ] 1. 写桌面 UI 流程：首次为空；添加账号、导入实际文件、创建任务、重启后保留；异步错误不覆盖用户输入；快速连续保存不产生旧快照覆盖。先运行 `npm run test:desktop -- --grep 'workspace'` 确认失败。
- [ ] 2. 保留用户已认可的页面结构和样式，替换桌面业务动作的内存修改为主进程操作；只在成功响应后更新显示，加载与错误各有明确状态。
- [ ] 3. 桌面账号按钮连接真实浏览器；登录状态按观察结果显示。无统计来源时显示“未同步”，消息列表显示未接通，移除桌面示例数据与虚构趋势。
- [ ] 4. 本地任务仍可准备、取消与查看；真实发布尚未接通时不显示“演示运行”或“发布成功”。HTML 演示继续明确标注并保持原交互。
- [ ] 5. 运行 `npm test` 与全部桌面测试，通过后提交。

## Task 6: Windows 构建、安装验收与可访问的交付

**Files:** 创建 `.github/workflows/windows-build.yml`、`docs/windows-desktop-acceptance.md`；修改 `electron-builder.yml`、`package.json`、`README.md`、`.gitignore`。

**Interfaces:** 提供 `npm run desktop:build`、`npm run desktop:dev`、`npm run test:desktop`、`npm run desktop:dist -- --win --x64`；应用 ID 为 `com.xumu.workspace`，NSIS 为当前用户安装，数据落在 Electron userData，构建输出到已忽略的 release 目录。

- [ ] 1. 验证实际打包后的路径：preload、renderer 和 SQLite 原生扩展均来自应用产物；在含中文与空格的用户目录中持久化和重启。先用打包验收用例确认尚无构建入口时失败。
- [ ] 2. 配置 Windows 原生构建，重建 Electron ABI；手动触发的 GitHub Actions 执行锁定依赖安装、前端测试、桌面测试和 x64 打包，上传测试结果与安装包，不自动发布公开 Release。
- [ ] 3. Linux 本地先验证 GUI、数据库和浏览器进程；当前环境没有 Wine，不以交叉构建替代 Windows 实机测试，也不把可生成的包直接称为可用安装包。
- [ ] 4. Windows 验收覆盖安装、正常用户权限启动、账号独立扫码、关闭重开、缺少浏览器、文件导入及重启、卸载时数据处理。用户凭据留在用户设备，远端写入行为本阶段不执行。
- [ ] 5. 报告签名状态；没有签名证书时明确为未签名构建，不伪造签名或让用户关闭系统安全机制。
- [ ] 6. 提交并推送可审阅的源码和 Windows 构建入口，提供真实 GitHub 文件/Actions 入口；只有 CI 产物实际存在后才提供安装包下载链接。

## 自审与待执行说明

本计划覆盖已确认设计的桌面基础、账号连接、素材本地管理和打包准备。真实视频发布与消息接入仍按前述边界保留到后续计划。接口名称在任务间一致，五类 Review Focus 均有对应的失败测试，现有 HTML 演示与桌面真实数据分离。

当前仅完成实施计划，未安装上述新增产品依赖或编写桌面产品代码。用户审阅计划并选择执行方式后开始逐任务实现。建议由当前会话直接实施，因为数据库、IPC、界面和浏览器接口连续依赖较多；也可选择逐任务委派及独立审阅。
