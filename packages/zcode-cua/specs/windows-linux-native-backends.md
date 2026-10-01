# Windows 与 Linux 本机电脑控制

## 产品规则

- 官方 `computer-use` 插件随对应平台的 ZenCode 桌面包安装，初始关闭；只有用户显式启用后才注册工具。缺少对应架构原生资产时拒绝 seed，不能显示虚假的可用状态。
- Windows x64/arm64 使用固定版本的 MIT `open-computer-use` UIA/Win32 执行器；Linux x64/arm64 使用固定版本的 MIT `computer-use-linux` AT-SPI/portal 执行器。构建时取得并校验二进制，运行时禁止下载。
- Linux 以已登录图形会话为前提；Wayland 能力由 `doctor` 返回的 portal、AT-SPI 与输入后端事实决定。Windows 以已登录的交互桌面为前提。两平台均不能把启动进程成功当作可以操作桌面。
- 设置页和插件列表在本机 Linux 桌面显示电脑控制启用开关，沿用 Windows 的无 macOS TCC 权限行布局。SSH、WSL、Docker、Web 仍显示不可用。启用后 Linux 的具体能力仍以 `doctor` 为准。
- 允许只读列举和观察；点击、键入等动作必须引用同一 CLI 会话最近一次观察得到的 ZenCode snapshot id。动作消耗该 snapshot；异常或未知结果不自动重试。屏幕图像按 MCP image 内容块转发，不写入长期存储。

## 状态、接口与时序

- CLI 的既有 CommandInbox/owner/lease 负责工具准入和 stale run 防护；`@zcode/zcode-cua` runtime 唯一持有每个 CLI 会话的原生 MCP 子进程、最新 snapshot id 和 pending 调用。Renderer 不持有这些事实。
- Node REPL client 经既有 broker 调用 `platform.describe`、`platform.call`；runtime 只允许固定的本机电脑控制 MCP 工具清单，不透传上游可能新增的 shell 或安装工具。不同平台的参数保持上游 MCP schema，由 `platform.describe` 提供当前工具定义。
- 每个会话一个 MCP stdio 子进程。先 `initialize`/`notifications/initialized`，然后 `tools/list`；调用按 JSON-RPC id 匹配。关闭会话、取消或进程退出时拒绝 pending、杀掉进程、废弃 snapshot。下一调用可新建进程，但绝不重放已经发送的动作。
- identity key 仍由现有 Host/CLI 生成；runtime key 为 `workspaceKey + remoteSessionId + sessionId`。手机远控复用同一 Host attachment 和 CLI 会话，桌面与手机只在投递方式上不同。

```text
用户启用插件 → CLI 工具注册 → CommandInbox/owner/lease → node_repl → broker
                                                        → CUA runtime (每会话 MCP 进程)
                                                        → Windows UIA 或 Linux AT-SPI/portal
观察 → runtime 生成 snapshot id → 动作携带 id → runtime 消耗 id → MCP tools/call
取消/会话结束/子进程退出 → 拒绝 pending → 废弃 snapshot → 结束进程
```

## 验收

1. Win x64/arm64 和 Linux x64/arm64 安装包包含匹配执行器；首次插件关闭，启用后可读取工具定义和能力状态。
2. Windows 登录桌面可列举应用、观察 UIA 元素、点击和输入；锁屏或服务会话明确失败。
3. Linux GNOME Wayland 图形会话 `doctor` 显示真实能力，可观察 AT-SPI 元素并通过 portal 或已就绪后备输入完成动作；X11 和其他 compositor 按能力显示降级。
4. 无观察、旧 snapshot、跨会话 snapshot、重复动作均被拒绝；取消/进程退出不重试动作，不能继续使用旧 snapshot。
5. desktop continuous 与 mobile replayable 两条投递链路均不创建第二个电脑控制会话。
6. Linux 桌面 E2E：首次打开设置，电脑控制插件可见且关闭；手动开启后设置页与输入框显示入口；进入会话读取 `doctor`，观察一个应用后完成一次元素动作；切到远端 workspace 时入口消失，设置页提示不可用。
