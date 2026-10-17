# 序幕 · 创作者工作台

Windows 多账号运营工具，包含已确认的 HTML 界面演示和 **0.2.0 Electron 桌面基础版**。桌面版可持久保存账号、真实视频副本和本地任务，并管理独立的账号登录浏览器。真实身份解析、视频发布和消息接入仍待验证或开发。

## 桌面基础版

使用 Node.js 24，在项目目录运行：

```sh
npm ci
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

Windows 原生构建入口是仓库 Actions 的 **Build Windows desktop**。安装包实际生成并通过测试后，工作流提供 **Xumu-Windows-x64** 产物。构建未配置开发者签名，未运行的 Windows 验收不算通过；详见 [Windows 验收步骤](docs/windows-desktop-acceptance.md)。

[打开 Windows 构建页面](https://github.com/yuchangfang21-design/my-project/actions/workflows/windows-build.yml) · [桌面实机运行截图](https://github.com/yuchangfang21-design/my-project/blob/preview/xumu-demo/artifacts/desktop-overview.png) · [本阶段交付与验证记录](docs/desktop-foundation-delivery.md)

最新云端结果：浏览器 10 项、实际 Electron 11 项、Linux 打包版 1 项测试全部通过；Windows 原生构建与安装结果仍需在对应平台确认。

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

桌面壳、SQLite、本地媒体和独立浏览器会话已实现，Linux Electron 测试单独记录。真实 Windows 扫码、身份识别、视频发布、评论及私信接入尚未通过验收，不能用 HTML 演示或本地夹具结果替代。
