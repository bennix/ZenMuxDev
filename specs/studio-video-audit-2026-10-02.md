# ZenMux 视频可用性实测（2026-10-02）

来源：[视频模型目录](https://zenmux.ai/models?output_modalities=video)、公开模型 `api_info`、[Vertex 协议](https://zenmux.ai/docs/zh/api/vertexai/generate-videos.html)、[原生视频协议](https://zenmux.ai/docs/zh/api/zenmux/generate-videos-native.html)、[Interactions](https://zenmux.ai/docs/zh/api/vertexai/create-interaction-native.html)。

使用本机订阅专用 Key（仅核对类型，不记录密钥）；中性英文杯子场景，无参考图；16:9，目录最短时长和低分辨率。共核对目录 20 个模型及旧内置 Seedance 1.5。16 个完整返回视频，纳入内置目录。这里只证明本次账号/时间点/最小参数组合可用，不宣称全部时长、比例、图生视频或所有订阅套餐均通过。

| 模型 | 协议 | 目录时长（秒） | 实测秒数 | 结果 |
| --- | --- | --- | --- | --- |
| `minimax/minimax-h3-max` | native | 5–15（整数） | 5 | 成功 |
| `google/gemini-omni-1.1-flash-preview` | interactions | 3–10（整数） | 3 | 成功 |
| `alibaba/wan3.0-video` | native | 2–30（整数） | 2 | 成功 |
| `alibaba/wan3.0-video-prime` | native | 2–30（整数） | 2 | 成功 |
| `pixverse/c1` | native | 1–15（整数） | 1 | 成功 |
| `pixverse/v6` | native | 1–15（整数） | 1 | 成功 |
| `bytedance/doubao-seedance-2.5` | vertex | 4–30（整数） | 4 | 成功 |
| `bfl/flux-3-video` | native | 5–20（整数） | 5 | 成功 |
| `klingai/kling-3.0` | native | 3–15（整数） | 3 | 上游返回 Account balance not enough |
| `klingai/kling-3.0-omni` | native | 3–15（整数） | 3 | 上游返回 Account balance not enough |
| `klingai/kling-3.0-turbo` | native | 3–15（整数） | 3 | 上游返回 Account balance not enough |
| `minimax/minimax-h3` | native | 4–15（整数） | 4 | 成功 |
| `google/gemini-omni-flash-preview` | interactions | 3–10（整数） | 3 | 成功 |
| `sapiens-ai/agnes-video-v2.0` | vertex | 1–18（整数） | 1 | 上游限流；复测未在有界等待内完成 |
| `alibaba/happyhorse-1.0` | vertex | 3–15（整数） | 3 | 成功 |
| `skyreels/skyreels-v4` | vertex | 3–15（整数） | 3 | 成功 |
| `bytedance/doubao-seedance-2.0` | vertex | 4–15（整数） | 4 | 成功 |
| `google/veo-3.1-fast-generate-001` | vertex | 4, 6, 8 | 4 | 成功 |
| `google/veo-3.1-lite-generate-001` | vertex | 4, 6, 8 | 4 | 成功 |
| `google/veo-3.1-generate-001` | vertex | 4, 6, 8 | 4 | 成功 |
| `bytedance/doubao-seedance-1.5-pro` | vertex | 旧配置 4–12 | 4 | HTTP 404 / invalid_model，当前目录不存在 |

Kling 三个模型均提交 HTTP 200，异步任务失败；不能从 `Account balance not enough` 推定用户余额或订阅配额不足。对 Turbo 补充订阅来源 header 的复测仍返回相同错误。本次暂不纳入可用内置目录；上游具体原因需 ZenMux 根据 request ID 确认。

HappyHorse 首次查询发生网络中断，后续查询**同一任务**成功，未重复提交。Agnes 首次被上游限流，间隔后复测仍未在有界轮询中返回完整视频，故本轮不保留，不能判为模型永久无效。

Gemini Omni 最初使用 Veo 路径造成 404；换正确 Interactions 协议成功。额外使用应用的结构化 `response_format` 实测 Omni 1.1 的 3 秒和 Omni 的 10 秒，均返回 HTTP 200 / 完整内联视频。

详细诊断（不含生成文件 URL、base64 或凭据）：[JSON 结果](studio-video-audit-2026-10-02.json)。

验证：shared/ui 单测 6 项、Settings 迁移测试 2 项通过；浏览器实测三协议模拟网络请求、404 终止、同一任务临时轮询失败恢复、取消、真实 StudioPanel 时长切换及手机宽度可见性通过。全仓 `pnpm typecheck`、`pnpm lint`（75 warnings / 0 errors）、`pnpm architecture:check --changed`（baseline 0 / new 0）通过。变更模块为 shared（纯协议/目录）、ui（网络与本次运行状态）、services（Settings 唯一 owner）。

源码与测试新增 831 行、删除 328 行，净增 503 行（不含 spec/审计文档及无关本地文件）。

按 `mise.toml` 指定的 Node 24.14.0 再次执行：8 项单测、真实浏览器回归及全仓 TypeScript project references 均通过；目标新文件/测试的格式检查通过。未重新打包桌面应用。
