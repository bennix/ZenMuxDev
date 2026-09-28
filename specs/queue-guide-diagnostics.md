# 队列引导提交与诊断

UI 只发出同一队列项的原位提升请求，CLI/runtime 是队列唯一所有者。保留 CAS、owner/lease 与任务存活检查。

点击 → 记录 commandId/sessionId/queueItemId/revision → CommandInbox 校验 → runtime 提升 → ACK → 等待模型边界消费。

- 仅明确返回 proto.staleRevision 的请求可重试，最多三次；每次从当前快照取 revision，要求 session、logEpoch、队列项文字与原请求一致且 dispatch 仍为 queued。不在网络异常后重复发送，不跨会话重试。
- ACK accepted/duplicate 只表示接受；UI 显示等待应用。失败使用引导专属文案并附原因码，保留原队列消息。
- 生产诊断使用 logger.lifecycle，记录请求/ACK/失败元数据，不记录文字、附件、凭据或原始异常对象。runtime 记录提升拒绝原因与成功事件。
- Desktop continuous 和 Web replayable 都使用当前快照；旧快照未推进时不盲目重试，不修改传输恢复语义。
- 验收：过期 revision 后新快照重试成功；会话/epoch/正文变化不重试；网络异常不重试；最多三次；已结束、被预留及带附件消息拒绝且不丢失；生产环境可看到关联日志。

## 持久化队列提升
普通 queue 经 enqueueDeferredInput 只写事件/输入账本，不保证出现在 activeTurn.pendingInputs。提升时先按原 ID 查询投影和 admitted 输入记录，核对纯文字、附件、占用锁及 activeTurn 身份；随后把同 ID 输入接入当前回合，引导消费仍由原 runtime 负责。找不到 admitted 记录时拒绝，不凭 UI 文本构造新任务。失败移除临时内存挂载，持久化队列保留。

## 长纯文本流主动交接
当当前模型请求尚未发出工具调用且有可消费 guide 时，引导持久化成功且释放预留锁后，主动通知当前请求并取消该模型请求（不取消 turn）；不依赖流式快照，因此无首字和重试等待也能交接。保存已收到的文本/推理，走现有无工具响应完成路径并消费 guide，继续同一 turn。用户显式 Stop 的 turn abort 优先，不转换为引导续跑；工具调用已开始时继续等待工具边界。日志记录 guide.streamHandoff，不记录内容；缺少最终 usage 时不伪造 token 数。


## 无输出请求的事件交接
runtime 仍是唯一队列所有者；turn 对象到当前请求回调的 WeakMap 仅保存唤醒订阅，不复制任务状态。请求结束必须注销，旧请求注销不能删除新订阅。注册时检查已有 guide，消除先入队后订阅的窗口。持久化失败不通知，正在执行工具不抢占。

```text
CommandInbox → runtime 持久化引导 → 释放预留锁 → 通知同一 turn 当前请求
 → 取消请求（保留 turn、历史、工具结果） → 正常收口 → FIFO 消费 guide → 同一 turn 下一步
```

Desktop continuous 与 mobile replayable 共用该 owner；订阅不持久化，恢复仍使用原有队列/事件投影。验收：零 chunk 请求被唤醒；工具开始后不取消；Stop 优先；旧订阅清理不影响新请求；不同 turn 隔离。日志仅记录 sessionId/turnId/assistantMessageId，交接前后可关联，不记录正文。

## 首次有效输出上限
每次模型尝试从发起开始最多等待 120 秒有效输出，重试不延长。start/start-step/心跳不重置窗口；非空正文、推理 delta 或工具调用/参数 delta 才解除首输出上限。随后沿用现有流空闲保护，持续输出不因总时长超过两分钟被截断。超时进入原重试/备用模型策略，保留同一 turn。
