# 序幕 · 创作者工作台

Windows 多账号运营工具，包含 HTML 界面演示和 **0.4.6 Electron 私密发布联调版**。桌面版保存账号、真实视频副本及任务，管理独立账号浏览器。用户已实机确认0.4.5身份读取成功；0.4.6新增单账号、单视频、仅自己可见的真实发布候选适配，仍待Windows实机验收。评论工作台与草稿为本地功能，评论读取/回复和私信尚未接通。

**历史0.4.2接入检查版：** 新增账号卡片“生成接入检查”，预览和复制本机只读报告，无需查地址或导出浏览器会话；账号身份识别、真实发布和评论仍未接通。报告用于后续联调，不能视为这些功能已完成。进展见[官方接入跟进](docs/official-site-integration-followup.md)。

**0.4.5账号核验版：** 官网SDK与用户实机响应已确认登录检查使用`/passport/account/info/v2/`，返回`message:success + data.user_id/user_id_str/screen_name`。软件已改用该接口，并支持首页/上传页没有资源历史时只读核验；拒绝访客、跨应用、重复绑定和错号。旧账号类型接口与收入统计均不再作为身份依据。发布、评论及私信仍未接通。见[账号核验说明](docs/account-identity-reader.md)。

**0.4.6私密发布联调：** 已按用户选择限定为仅自己可见；必须逐条核对，结果不明不会重复发送。表单与发布回执规则尚待真实站点验证，匹配失败会停止。操作步骤及限制见[单视频私密发布联调](docs/private-publishing-trial.md)。

## 桌面版

使用 Node.js 24，在项目目录运行：

```sh
npm ci --ignore-scripts
npm run desktop:prepare
npm run desktop:dev
```

电脑需安装 Chrome 或 Edge。账号扫码在官方页面完成；当前没有已验证的抖音身份解析器，因此账号保持待确认，不会仅因打开网页就标为已登录。桌面版首次为空，与下面的演示数据独立。

```sh
npm run test:desktop
npm run desktop:dist -- --win --x64
npm run test:packaged
```

Linux 图形测试需要 Xvfb 或已有 DISPLAY，缺少默认 Xvfb 时可设置 `XUMU_XVFB_PATH`。Windows 不使用 Xvfb。SQLite 13 使用 npm 包中已验证可由 Electron 加载的 Node-API 预编译模块；不执行多余的 ABI 重编译。

**Windows安装包：** [0.4.5账号核验版构建与下载入口](https://github.com/yuchangfang21-design/my-project/actions/runs/39197315750)。登录GitHub后，在该页 **Artifacts** 中下载 **Xumu-Windows-x64**，解压ZIP并运行 `Xumu-0.4.5-win-x64.exe`；随包提供 `SHA256SUMS.txt`。本次Windows原生桌面98项、打包后程序3项全部通过，均无失败或跳过。安装后打开已有账号的官方浏览器，保持窗口打开，返回账号卡片点击“检查状态”；若仍待确认，点击“生成接入检查”预览并复制新报告。无需删除原账号或导出登录会话。真实身份接口及响应格式已取得实机证据，新版软件识别结果和真实发布/评论仍待验收，具体记录见[账号核验说明](docs/account-identity-reader.md)。

**权限验证：** [Windows原生补充验收](https://github.com/yuchangfang21-design/my-project/actions/runs/39122040630)已用NTFS ACL覆盖0.4.1中原先跳过的两项场景，完整桌面套件77项通过、0失败、0跳过；备份无法创建时保留旧数据库，恢复权限后可升级。0.4.2完整构建也执行了这些测试。详见[权限验证记录](docs/windows-permissions-followup.md)。

Windows 原生构建入口是仓库 Actions 的 **Build Windows desktop**。安装包实际生成并通过测试后，工作流提供 **Xumu-Windows-x64** 产物。构建未配置开发者签名，未运行的 Windows 验收不算通过；详见 [Windows 验收步骤](docs/windows-desktop-acceptance.md)。

[打开 Windows 构建页面](https://github.com/yuchangfang21-design/my-project/actions/workflows/windows-build.yml) · [桌面实机运行截图](https://github.com/yuchangfang21-design/my-project/blob/preview/xumu-demo/artifacts/desktop-overview.png) · [评论阶段 B 交付与验证记录](docs/comments-stage-b-delivery.md) · [Windows 评论验收](docs/windows-comments-acceptance.md)

0.4.0最终云端验收：实际Linux Electron74项、浏览器10项、实际Linux打包3项全部通过；完整边界、一次独立审阅及4项修复见[阶段 B 交付记录](docs/comments-stage-b-delivery.md)。Windows原生构建与安装结果仍需在对应平台确认。

已实现独立发布文案与修订、完整核对清单、共享串行队列、提交前记录、不确定结果及重启恢复；评论新增账号筛选、来源归属、数据库草稿、离开/退出保护、逐条回复确认与只读结果核对。生产发布和评论适配器保持禁用，不会上传、发布或发送真实内容。

- [实际评论工作台截图](artifacts/comments-workspace.png)（仅本地测试记录）
- [960px 评论抽屉](artifacts/comments-drawer.png)
- [实际发布工作台截图](artifacts/publishing-workspace.png)
- [实际核对弹层截图](artifacts/publishing-review.png)
- [窄窗口抽屉截图](artifacts/publishing-drawer.png)
- [Windows 与真实发布验收](docs/windows-publishing-acceptance.md)

## 后续设计稿

继续沿用当前界面，补齐发布前核对、结果待核对和统一消息工作台。发布部分已按阶段 A 落地到桌面版，仍未启用真实发布；评论部分已实现本地存储、同步状态、回复草稿、确认与结果恢复；正式适配器保持禁用，私信另列阶段 C。

- [发布前核对效果图](artifacts/design-publishing-review.png)
- [结果待核对效果图](artifacts/design-publishing-recovery.png)
- [统一消息工作台效果图](artifacts/design-inbox-workbench.png)
- [下载设计稿包](artifacts/xumu-next-stage-design.zip)：下载原始 ZIP 后解压，用 Edge 或 Chrome 打开 `index.html`，无需安装依赖。
- [详细流程设计](docs/superpowers/specs/2026-10-17-publishing-and-inbox-experience-design.md)
- [发布阶段 A 实施计划](docs/superpowers/plans/2026-10-17-publishing-stage-a.md)：数据库迁移、提交记录、确认与恢复、桌面接入和 Windows 实测，已按用户确认沿用直接开发方式执行，验证范围见本阶段交付记录。
- [评论阶段 B 实施计划](docs/superpowers/plans/2026-10-18-comments-stage-b.md)：按账号归属、同步状态、500ms 草稿、逐条回复确认和恢复；已获确认并实现本地核心，真实读取/回复尚未通过官网验收。

## 直接查看效果

聊天内置预览不可用时，可以从本仓库的 `preview/xumu-demo` 分支取得文件：

- [演示包文件页](https://github.com/yuchangfang21-design/my-project/blob/preview/xumu-demo/artifacts/xumu-demo.zip)：登录拥有仓库访问权的 GitHub 账号后，点击下载原始文件的按钮，解压并打开 `index.html`。
- [工作台截图](https://github.com/yuchangfang21-design/my-project/blob/preview/xumu-demo/artifacts/overview.png)
- [素材库截图](https://github.com/yuchangfang21-design/my-project/blob/preview/xumu-demo/artifacts/assets.png)
- [消息中心截图](https://github.com/yuchangfang21-design/my-project/blob/preview/xumu-demo/artifacts/messages.png)

这些链接是 GitHub 仓库文件入口。仓库的访问权限保持不变，软件没有部署为公网网站。

项目根目录的 `index.html` 和 `artifacts/序幕-交互演示.html` 都是自包含演示文件，可以放入 HTML 预览或在 Edge/Chrome 中打开。它们包含界面代码、样式和插图，无需安装 Node.js、无需联网加载素材。预览不允许脚本运行时，会保留实际界面截图，而不是显示空白页。

`development.html` 是依赖 Vite 的开发源码入口，不应当作为独立 HTML 预览或下载运行。

可以体验：

- 工作概览、账号卡片、素材库、发布队列、消息中心与设置。
- 添加账号档案、搜索、导入 MP4/MOV 文件信息、编辑素材标题和分类。
- 选择素材和多个账号创建任务、阻止重复的未完成任务、确认演示运行、取消待执行任务。
- 筛选示例评论和私信、保存回复草稿、标记本地处理状态。
- 浏览器本地数据持久化、导出 JSON、确认后重置。

示例账号、播放指标、消息及封面内容均用于演示。新增账号始终显示“未连接”。导入只保留文件信息，不复制或上传视频原文件。演示运行不连接抖音，不上传、发布、读取或发送真实内容。扫码登录按钮显示接入说明，可由用户主动打开官方创作者页面；不模拟二维码，不读取该页面会话。

本地数据保存在当前浏览器中，独立 HTML 与开发服务的存储不共享。清理网站数据、更换文件位置或更换浏览器可能导致记录不可用；需要保留时先从设置导出。

## 开发与验证

使用 Node.js 24 和 npm，执行：

```sh
npm ci --cache /tmp/xumu-npm-cache
npm run dev
```

在 Windows 上可以直接运行 `npm ci`，无需指定 Linux 临时目录。开发服务默认端口为 5173，实时开发入口为 `/development.html`；根路径展示导出的独立演示。

```sh
npm run build
npm test
npm run demo:export
```

测试使用 Playwright 与本机 Chromium，默认可执行路径为 `/usr/bin/chromium`。在其他机器上将 `CHROMIUM_PATH` 设为实际 Chrome/Chromium 可执行文件的完整路径后运行测试。测试命令先构建和导出，确保验证最新内容。导出命令同步生成根目录 `index.html` 和 `artifacts/序幕-交互演示.html`，以经典脚本运行，无需模块或 TSX 加载器。

## 设计与后续接入

- [Windows 产品设计](docs/superpowers/specs/2026-10-17-douyin-desktop-design.md)
- [本次效果演示实施计划](docs/superpowers/plans/2026-10-17-interactive-preview.md)

桌面壳、SQLite、本地媒体和独立浏览器会话已实现，Linux Electron 测试单独记录。评论核心有独立实际 Electron 回归；真实 Windows 安装、扫码、身份识别、视频发布、评论读取/发送及私信接入尚未通过验收，不能用 HTML 演示或本地夹具结果替代。
