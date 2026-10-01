# PPT 版面修复模型与 JEV 协作

## 产品规则

设置中的 PPT 修复模型负责生成修复 HTML，留空跟随成稿模型。新增可持久化的 JEV 评估模型 ID，默认 typesafe/jev-1.13，留空关闭评估。JEV 使用 System One 接口，只评估，不作为 Chat Completions 成稿模型。

逐页生成和手动美化复用 repairStudioSlide。每轮修复前，JEV 接收当前完整 HTML 和本地检测问题，返回的评估作为修复模型输入。JEV 不能覆盖浏览器几何、资源与导出检查结果；不完整 HTML 先修格式。JEV 服务异常显示提示，继续本地修复；取消必须终止请求。最多五轮，保留完整页并标记剩余问题。

## 所有者和接口

studioRepairModelStore 唯一拥有设置；repairStudioSlide 开始时快照评估模型。ensureSlideLayout 唯一拥有修复循环和验收结果；evaluate 回调只提供建议，不修改页面。StudioPanel 已有进度与流式输出回调展示评估状态。最终页面沿原有 onPage/替换路径写入。

```mermaid
sequenceDiagram
 participant UI as StudioPanel
 participant Loop as ensureSlideLayout
 participant JEV as System One
 participant Repair as 修复模型
 UI->>Loop: 页面及任务设置
 Loop->>Loop: 本地版面/导出检查
 Loop->>JEV: 完整 HTML + 检查问题
 JEV-->>Loop: 评估建议（失败则提示）
 Loop->>Repair: 页面 + 问题 + 评估建议
 Repair-->>UI: 修复流式输出
 Repair-->>Loop: 完整 HTML
 Loop->>Loop: 重新检查，最多五轮
 Loop-->>UI: 通过或保留带警告页面
```

## 验收场景

- 配置修复模型与 JEV 后，修复请求包含 JEV 评估；二者接口分离。
- JEV 留空不调用评估；旧设置无评估字段时迁移为默认模型。
- 评估失败不丢页；取消不降级继续。
- 不完整页面不发送 JEV；本地检查通过的普通生成页不额外调用。
- 单页生成/美化共用相同链路；五轮限制保持。
- 不改预览、PDF 或其他导出路径。OfficeCLI 无原生 PDF 转可编辑 PPT 的已验证接口，本 spec 不声称实现该转换。
