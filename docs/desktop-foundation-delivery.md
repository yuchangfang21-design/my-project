# 序幕 0.2.0 桌面基础版交付记录

日期：2026-10-17。对应[已批准的实施计划](superpowers/plans/2026-10-17-windows-desktop-foundation.md)。源码位于 `preview/xumu-demo`；本阶段交付桌面基础和 Windows 构建入口，尚不是完整的抖音运营软件。

## 已实现

- Electron 桌面程序，沿用已确认的界面；首次显示真实空工作区，与 HTML 演示隔离。
- SQLite 保存账号档案、素材信息、本地任务和取消记录，重启后保留；拒绝覆盖来自较新版本的数据库。
- MP4/MOV 经系统选择框导入，复制到应用素材目录、流式计算 SHA-256、检测重复。只检查基础容器头，不代表通过抖音上传格式验收。
- 启动检查素材完整性，缺失或损坏时显示重新导入提示并阻止创建新任务；用相同原视频恢复副本时保留素材 ID、编辑标题和已有任务。
- 退出时取消并等待导入清理；重启只清理应用 UUID 命名的临时文件和未登记副本。相同数据目录只允许运行一个应用实例。
- 每账号使用独立 Chrome/Edge 配置打开官方登录页，同账号并发打开复用上下文。应用重启后将中断或历史登录观察恢复为“待确认”，保留身份记录供之后核对。
- Windows x64 NSIS 构建工作流，包含前端测试、实际 Electron 测试、打包版启动测试和安装包 SHA-256 清单；不创建公开 Release。

身份观察器尚未经过真实网页验证，因此始终保持待确认。真实视频发布、评论和私信读取与回复尚未接入；自动刷视频不在范围内。本地任务的“已创建”不等于真实发布成功。

## 实际验证

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| TypeScript 与 Vite 构建 | 通过 | 前端、主进程、preload、相对 renderer 资源 |
| HTML / 浏览器回归 | 10 / 10 通过 | 包含离线独立 HTML、脚本不可用时截图、原演示交互 |
| 实际 Electron 回归 | 11 / 11 通过 | 数据库、导入与恢复、浏览器隔离夹具、退出清理、重复启动、真实桌面 UI |
| Linux 打包版启动 | 1 / 1 通过 | 实际产物加载原生 SQLite、中文及空格数据目录、创建与重启读取 |
| Windows ZIP 交叉构建 | 曾成功 | 审阅修复前的候选产物；没有运行验证，不作为安装包交付 |
| 云端 Windows NSIS 交叉构建 | 受阻 | Linux 缺少 Wine，未提供失败构建留下的不完整 exe |
| Windows 原生 CI | 待执行 / 确认 | 构建入口见下方；当前云端无法通过 GitHub API 查询结果 |
| Windows 安装、普通用户启动 | 未执行 | 需从成功的 Windows CI 下载产物后实机验收 |
| 真实扫码与身份识别 | 未执行 | 云端访问创作者站点遭代理 403；夹具测试不代替真实账号验证 |

独立审阅发现 0 项 Critical、3 项 Important，均已用先失败、后通过的实际 Electron 回归修复：丢失或损坏素材无法恢复、导入中正常退出遗留大文件、登录启动中断后状态卡住。没有未处理的 Important 项或本次审阅确认的 Minor 项。修复后的完整测试及 Linux 打包版测试已重新通过；未再开启新的审阅循环。

## 工程取舍与代价

1. 按批准计划留在现有隔离分支，不新建 worktree：保持当前环境可用；代价是没有额外一层工作树隔离。
2. 云端技能辅助脚本没有可执行的本地路径，手工维护等价的任务、测试和提交记录：保留执行证据；代价是不使用辅助脚本的自动化便利。
3. `better-sqlite3` 13 的 npm 包自带经过依赖完整性校验的 Node-API 预编译模块，已在 Node 和实际 Electron 中加载；关闭重复原生重编译：避开不可达的头文件下载；代价是 Windows 原生加载仍需单独验证。
4. 官方网页不可访问时不编造身份选择器，观察器返回待确认：避免错误绑定；代价是真实身份识别尚不能使用，需要 Windows 官方页面证据与验证。
5. 当前没有签名证书，候选构建未签名，保留 Electron 原执行文件：不伪造签名；代价是文件属性可能保留 Electron 信息，Windows 安装体验尚待实测。
6. Git 访问可用、GitHub API 返回 Forbidden，使用 `desktop-build-*` 标签显式请求 Windows CI，同时保留手动入口：不提取凭据；代价是消耗一次 CI 构建，且云端不能确认其最终结果，需要访问 Actions 查看。

完整性检查会读取受管视频内容，启动耗时和磁盘读取量随素材库大小增加。当前只导出档案元信息，不能代替视频及会话备份。

## 获取与验收

- [源码与使用说明](https://github.com/yuchangfang21-design/my-project/tree/preview/xumu-demo)
- [实际桌面空工作区截图](https://github.com/yuchangfang21-design/my-project/blob/preview/xumu-demo/artifacts/desktop-overview.png)
- [Windows 构建入口](https://github.com/yuchangfang21-design/my-project/actions/workflows/windows-build.yml)
- [Windows 安装与扫码验收步骤](windows-desktop-acceptance.md)

本次构建标签使用 `desktop-build-0.2.0`。登录有仓库访问权限的 GitHub 账号，在 Actions 中打开对应运行；只有所有步骤成功，才会出现 `Xumu-Windows-x64` 产物。产物包含安装程序和 `SHA256SUMS.txt`，下载解压后核对校验值。没有看到成功产物时，不把源码 ZIP 或 HTML 演示包当作 Windows 安装程序。
