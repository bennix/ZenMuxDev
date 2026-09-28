import type { SessionControl } from "@zcode/shared/zcode-protocol-v4";
import type { AssistantWorkRow } from "./conversationTurnFlowItems.js";

/** 仅展示事件已经确认的活动；没有活跃行不推测模型正在做什么。 */
export function conversationLiveActivity(
  rows: readonly AssistantWorkRow[],
  control?: SessionControl,
) {
  const tools = rows.filter((row) => row.kind === "toolCall");
  const active =
    tools.find((row) => row.status === "pendingApproval") ??
    tools.find((row) => row.status === "running" && !row.backgrounded) ??
    tools.find((row) => row.status === "inputStreaming");
  const streaming = [...rows]
    .reverse()
    .find(
      (row) =>
        (row.kind === "assistantText" || row.kind === "reasoning") && row.state === "streaming",
    );
  const specialWork = control?.activeWorks.find((work) => work.kind !== "primaryTurn");
  const phase =
    control?.stopState === "stopping"
      ? "stopping"
      : control?.apiRetry
        ? "retry"
        : control?.phase === "prewarming"
          ? "prewarming"
          : specialWork
            ? specialWork.kind
            : active
              ? active.status === "pendingApproval"
                ? "approval"
                : active.status === "inputStreaming"
                  ? "preparingTool"
                  : "tool"
              : streaming?.kind === "assistantText"
                ? "reply"
                : streaming?.kind === "reasoning"
                  ? "reasoning"
                  : "waiting";
  const latest = tools.at(-1);
  return {
    phase,
    // 协议 reasonCode 不是用户文案，须由 UI 本地化后展示。
    retryReasonMessageId:
      control?.apiRetry?.reasonCode === "fault.network.sseStalled"
        ? "chat.activity.reason.stalled"
        : control?.apiRetry?.reasonCode === "fault.network.sseDisconnected"
          ? "chat.activity.reason.disconnected"
          : "chat.activity.reason.connection",
    attempt: control?.apiRetry?.attempt ?? 0,
    tool: active?.toolName ?? "",
    completed: tools.filter((row) => row.status === "success").length,
    latestTool: latest?.toolName,
    latestStatus: latest?.status,
  };
}
