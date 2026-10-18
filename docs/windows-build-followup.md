# Windows 构建跟进

本轮优先让 Windows 安装包构建得到可诊断、可验证的结果。正式抖音身份、发布、评论适配器继续禁用；未在云端模拟用户扫码成功。

## 已取得的真实证据

- 0.4.0 原生运行：[39113131053](https://github.com/yuchangfang21-design/my-project/actions/runs/39113131053)，对应源码 `e2bd1dc`。
- GitHub 公共网页确认运行失败，失败步骤为 `Run npm run test:desktop`，退出码1。该运行只有 `Windows-test-results` 测试结果产物，没有可确认的 `Xumu-Windows-x64` 安装包。
- [原生任务页面](https://github.com/yuchangfang21-design/my-project/actions/runs/39113131053/job/117633290948)要求登录后查看详细日志，公开注释只有退出码。尚不能据此断言是哪一项 Windows 测试失败。
- GitHub 网页可访问；GitHub API 和抖音官网当前仍被运行环境的代理拒绝（403）。已把 `api.github.com` 和 `creator.douyin.com` 加入环境配置草稿，保留现有包管理器预设；保存草稿不改变当前网络，需在环境设置中审核、保存并发布。

## 本轮诊断改动

现有 Windows 工作流继续执行全部测试，增加 Playwright JSON 结果和 `always()` 摘要步骤，把具体失败用例、源文件行号、精简错误写入 GitHub 注释和任务摘要。不发布报告附件正文，不输出环境变量或凭据，不跳过测试、不增加超时、不改变原测试退出码。构建或测试失败时后续安装包步骤仍不执行。

报告明确区分通过、失败、跳过、不稳定、预期失败、运行器错误。缺报告或零用例不能表述为全部通过。新增 Node 内置测试无需安装依赖。

独立审阅发现1项重要问题：真实 Playwright 的 `spec.file` 相对于 testDir，原始诊断测试错误地使用了仓库相对路径。已以真实报告形态复现失败，再修复仓库路径映射，补充 Windows 绝对路径及越界路径验证；没有其他审阅问题。

## 本地验证

- 新增诊断测试：最初缺实现5项失败，随后通过；真实相对路径回归先失败，修复后最终7项通过。
- 实际 Linux Electron 的完整74项通过，并生成真实 Playwright JSON，摘要正确报告74通过、0失败。该结果验证报告集成，不能代替 Windows 原生结果。
- 浏览器与离线演示回归：10项通过。

使用新的诊断标签 `desktop-build-0.4.0-diagnostics-1` 请求一次 Windows 运行；不改写已存在的 `desktop-build-0.4.0` 标签。下一步依据新注释中的实际失败修复，再核查原生打包与产物。当前尚未宣称 Windows 构建或安装成功。

## 已完成的读屏收尾

评论行现在提供与当前详情一致的 `aria-pressed` 状态，读屏用户可识别选中的评论。该项属于阶段B记录的唯一延期小问题，本轮已补齐。相关现有评论界面8项及浏览器/离线演示10项通过；没有增加产品依赖或改变真实账号操作开关。

诊断运行：[39114287914](https://github.com/yuchangfang21-design/my-project/actions/runs/39114287914)，标签 `desktop-build-0.4.0-diagnostics-1`，对应源码 `da720d0`。本轮以该运行的新注释确认具体原生失败；截至本记录生成时尚在执行，不能将标签推送当作构建通过。
