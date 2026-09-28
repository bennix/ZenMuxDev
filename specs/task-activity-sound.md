# 前台任务活动提示音

复用任务通知和通知声音两个现有开关。前台聚焦窗口中新增权限/问题交互、已观察到的工作段结束、后台子任务 running→resultPending/failed 时播放现有短提示音。后台沿用平台系统通知，不再叠加播放。

snapshot → hook 唯一观测游标 → 事件边沿去重 → 现有播放器（再次检查偏好）。首个快照仅建基线；切换 workspace identity/session/logEpoch 重建基线，不回放历史。不对 token、普通工具或流式 chunk 响铃。多个事件同帧合并一次，播放器短间隔防重叠。Desktop continuous 与 Web replayable 共用 ID/状态判定。浏览器播放限制不影响任务。

验收：首次历史无声音；新交互只响一次；阶段结束和子任务完成响；重复快照不响；切换会话无补响；关闭设置静音。
