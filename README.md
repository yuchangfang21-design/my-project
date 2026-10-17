# 序幕 · 创作者工作台

Windows 多账号运营工具的**可操作界面演示**。采用 React、TypeScript、Vite；不是 Windows 桌面安装包。

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

真实 Windows 桌面壳、独立浏览器会话、真实扫码、视频发布、评论及私信接入尚未实现。后续需要逐项验证真实站点能力、账号隔离、发布结果核对和 Windows 安装包，不能用本演示的通过结果替代实机验收。
