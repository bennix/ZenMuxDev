# macOS 原生电脑控制接入

## 产品规则

- `computer-use` 随 ZenCode 默认安装到官方插件缓存并出现在插件列表中，初始保持关闭；已有用户的显式启停选择继续有效。安装与启用是两个独立状态。
- macOS 插件种子必须包含匹配架构的原生执行器；缺少二进制时整个插件拒绝 seed，输入框显示未提供插件，不能仅凭插件清单宣称可用。
- 用户显式启用电脑控制并获得系统辅助功能、屏幕录制权限后，模型才能观察和操作桌面应用。按钮的启用状态不能代替权限、原生执行器或工具注册的就绪状态。
- macOS 使用 MIT 许可的 `maka-agent/maka-cu` 原生可访问性观察与输入分发实现，随本地构建打包。Windows 和 Linux 的独立原生后端及能力边界见 `windows-linux-native-backends.md`。
- 外部浏览器（如 Brave）属于桌面应用控制目标；内置浏览器继续使用 `browser-use`，两者入口和能力说明分开。

## 所有者与接口

- CLI 会话运行时拥有工具调用准入和取消；`@zcode/zcode-cua` 的 runtime 唯一持有原生子进程及 CLI 会话到原生 session 的映射。原生执行器唯一持有 snapshot token 与图片生命周期；runtime 验证并转发图片，不另存 snapshot。Renderer 只显示来自插件与运行时的事实。
- `computer-use-client.mjs` 作为宿主 Node 模块加载；bootstrap 必须将 REPL 的 `globalThis` 显式传给 client，client 才能读取注入的 CUA bridge。模块自己的 `globalThis` 不属于 REPL 上下文。
- 本机原生执行器通过受控的 stdio JSON-RPC `maka.cu/2` 接口连接。必须先 `host.hello`，再 `session.begin`；一次 `observe` 返回的元素 token 与 digest 仅能用于该 snapshot 的 `dispatch.element`，不可按索引重新匹配另一帧。
- 进程路径来自随应用打包并校验的 `bin/macos-<arch>/OpenComputerUse`，本地 `ZCODE_CUA_DEV_MODE=1` 时才允许显式 `ZCODE_CUA_EXECUTOR_PATH` 供诊断。不得在运行时下载二进制；上游实质代码与安装包均保留 MIT 版权和许可声明。
- 本地与手机远控复用桌面 Host attachment、同一 CLI 会话和 runtime。`workspaceIdentity?.trim() || workspacePath` 用于身份隔离；远程请求保留 `remoteSessionId`。桌面实时流与手机可重放恢复只改变投递方式，不复制原生会话。

```text
用户显式启用 → 插件管理 → CLI 工具注册
模型调用 → CommandInbox 准入 → node_repl bridge → broker → CUA runtime
                                                   → maka-cu 子进程 → macOS 权限/应用
观察返回 snapshot/token/digest → 模型选择动作 → runtime 校验同一会话与 snapshot → 原生分发
取消、会话结束或子进程退出 → runtime 废弃 token/图片并结束原生 session
```

## 失败与时序

- `host.hello` 版本不符、权限缺失、进程退出和响应格式错误时拒绝相关调用。进程退出会拒绝所有 pending；下一次调用前废弃旧 session 映射并重建进程，不自动重放可能已执行的输入。
- 元素变化、snapshot 过期、已消费或被覆盖时要求重新观察；`outcome_unknown` 不重试原动作。取消须阻止新分发并释放 session。
- 截图只通过受控目录返回；读取时核对路径归属、字节数和 `sha256:` 摘要，结束时清理。
- owner/lease 与 stale run 检查保留在现有 Host/CLI 边界，不能因为原生层成功返回就绕过。

## 验收场景

0. 首次启动自动 seed 插件清单与匹配架构的执行器，插件默认关闭；缺少原生 runtime 时拒绝 seed 并显示不可用。
1. 缺少执行器、插件或系统权限时，用户得到准确原因，模型不收到虚假的成功结果。
2. 获得权限后，在 Brave 等桌面应用中列出窗口、观察元素、执行一次绑定 snapshot 的点击或输入，并观察结果。
3. 旧 token、变更的 digest、跨会话 token 均被拒绝；未知执行结果不自动重试。
4. 用户取消、关闭会话及原生进程异常退出后，不能继续操作，也不遗留截图。
5. 桌面直接会话与手机远控同一会话分别验证实时和重放语义。
