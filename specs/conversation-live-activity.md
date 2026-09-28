# 对话运行活动摘要

运行中的工作段标题下显示真实活动摘要，折叠历史时仍可见。只读取该工作段的权威 timeline rows，不新增服务端状态或计时器。优先显示待授权、执行中的工具及名称；其次显示流式回复/推理；没有活跃事件时显示“等待下一步更新”，不虚构模型内部处理。显示成功工具数量与最近一个工具的名称/结果，用户可展开现有历史查看详情。完成或中断后隐藏运行摘要。

事件 → 现有 snapshot/replay → 工作段 rows → 纯函数活动投影 → UI。
Desktop continuous 与 Web replayable 共用投影，切换工作段不沿用旧状态。中英文、移动窄屏换行、键盘展开沿用现有组件。验收覆盖等待、运行工具、授权、回复、成功计数和错误最近项。

## 会话控制状态补充
摘要还需读取同一 snapshot.control。优先显示 stopping、apiRetry、prewarming 与 compact/goalVerifier/goalContinuation/turnSteer/foregroundSubagent 事实。没有可展示行时明确提示尚未收到可展示进展，不把未知情况写成模型思考。只用于运行中的工作段，不污染历史段；无新计时器或副本状态。
