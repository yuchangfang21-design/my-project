# Windows 迁移备份权限验证

本轮补齐0.4.1原生验收中跳过的两项权限场景，不新增产品功能，不修改真实工作区或浏览器会话。

目标：已有数据库升级前若备份文件无法创建，立即停止迁移；旧数据库版本、任务和记录不变。修复权限后可重新升级。

先移除Windows跳过并保留原POSIX chmod夹具，请求一次仅测试的原生运行，确认旧夹具无法模拟Windows拒写。随后改为临时测试目录上的原生ACL，并恢复原访问规则，复测两项和完整桌面套件。独立工作流只上传测试报告，不生成或交付安装包。

失败敏感性：删除迁移前备份步骤或吞掉其写入错误，应导致这些测试失败。真实抖音身份及收发能力仍需用户Windows官方页面的独立证据。


原生RED：[39121305691](https://github.com/yuchangfang21-design/my-project/actions/runs/39121305691)，源码 `d05340c`，0通过、2失败、0跳过。旧chmod没有拒写，两项均继续迁移到3，符合夹具缺口预期。原Linux两项通过。

新夹具保存并恢复临时目录的原DACL，仅对当前SID拒绝目录CreateFiles，拒绝规则不继承到现有数据库文件。实际文件创建probe必须得到EACCES/EPERM；测试核对完整schema、所有表记录、外键及版本都未变化，无备份文件被创建；恢复权限后迁移成功。Linux仍使用原POSIX权限语义。

一次独立只读审阅：Critical0、Important0、Minor2，均已修正。创建与删除probe的异常捕获分开，避免删除失败冒充创建拒绝；定向报告保存到Playwright输出清理目录之外，完整回归不会删除它。审阅不代替原生验证。


首次原生ACL运行 [39121671116](https://github.com/yuchangfang21-design/my-project/actions/runs/39121671116)，源码 `dbf448b`，在Get-Acl自动加载Microsoft.PowerShell.Security模块时失败，尚未修改ACL、未进入拒写验证。接下来显式Import-Module同名模块以显示内部加载错误；该步用于定位工具链，不改产品迁移逻辑。


显式导入探测 [39121881123](https://github.com/yuchangfang21-design/my-project/actions/runs/39121881123)，源码 `5576d16`，显示ObjectSecurity的Access/Sddl等扩展类型成员重复。工作流父shell为PowerShell7，而夹具明确启动Windows PowerShell5。修复只在子进程环境中移除继承的PSModulePath，让其重建自身默认路径，同时以宿主PSHOME下的绝对manifest导入系统Security模块；不忽略类型错误，不修改用户或机器环境配置。

## 最终验证

Windows原生运行 [39122040630](https://github.com/yuchangfang21-design/my-project/actions/runs/39122040630)，标签 `desktop-permissions-native-2`，源码 `ece9260`，状态 **Success**。两项定向权限测试通过；随后完整桌面套件 **77通过、0失败、0跳过、0不稳定、0运行器错误**。报告产物为 `Windows-permission-test-results`，包含定向和完整JSON报告。原先两个Windows跳过项已被实际NTFS拒写验证覆盖。

Linux完整桌面套件也为77通过、0失败、0跳过。独立审阅的两项Minor均已修正。此后Windows模块路径修复仅影响测试夹具，不改变Linux分支或产品逻辑。

本轮只修改测试、测试工作流和说明；`desktop/`、`src/`、`shared/`、依赖声明与锁文件、打包配置均与0.4.1成功安装包源码 `75ed22a` 一致，因此继续使用[已有0.4.1安装包](https://github.com/yuchangfang21-design/my-project/actions/runs/39118990826)，无需重新下载安装包来获得本轮验证。

这些结果证明备份拒写会阻止迁移并保留原数据库，以及恢复权限后可升级。用户尚未下载安装；手动安装、卸载、官方扫码身份核验及真实发布、评论读写仍待实机验收，私信尚未接通。
