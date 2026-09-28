import assert from "node:assert/strict";
import { test } from "node:test";
import { conversationLiveActivity } from "../src/v4/conversationLiveActivity.js";
import type { AssistantWorkRow } from "../src/v4/conversationTurnFlowItems.js";
const rows = (values: unknown[]) => values as AssistantWorkRow[];
test("empty timeline reports waiting without inventing activity", () => {
  assert.equal(conversationLiveActivity([]).phase, "waiting");
});
test("active tool and completed count remain visible in collapsed history summary", () => {
  const result = conversationLiveActivity(
    rows([
      { kind: "toolCall", toolName: "Read", status: "success" },
      { kind: "toolCall", toolName: "Bash", status: "running" },
    ]),
  );
  assert.equal(result.phase, "tool");
  assert.equal(result.tool, "Bash");
  assert.equal(result.completed, 1);
});
test("approval takes priority and failures are not counted as completed successes", () => {
  const result = conversationLiveActivity(
    rows([
      { kind: "toolCall", toolName: "Write", status: "pendingApproval" },
      { kind: "toolCall", toolName: "Bash", status: "error" },
    ]),
  );
  assert.equal(result.phase, "approval");
  assert.equal(result.completed, 0);
  assert.equal(result.latestStatus, "error");
});
test("streaming response is identified from actual row state", () => {
  assert.equal(
    conversationLiveActivity(rows([{ kind: "assistantText", state: "streaming" }])).phase,
    "reply",
  );
  assert.equal(
    conversationLiveActivity(rows([{ kind: "reasoning", state: "complete" }])).phase,
    "waiting",
  );
});

test("control facts explain quiet periods without timeline rows", () => {
  const control = {
    phase: "running",
    stopState: "stoppable",
    apiRetry: null,
    activeWorks: [],
  } as any;
  assert.equal(
    conversationLiveActivity([], { ...control, apiRetry: { attempt: 2 } }).phase,
    "retry",
  );
  assert.equal(
    conversationLiveActivity([], { ...control, activeWorks: [{ kind: "compact" }] }).phase,
    "compact",
  );
  assert.equal(
    conversationLiveActivity([], { ...control, phase: "prewarming" }).phase,
    "prewarming",
  );
  assert.equal(
    conversationLiveActivity([], { ...control, stopState: "stopping" }).phase,
    "stopping",
  );
});
test("SSE retry reason uses a translation key instead of exposing protocol codes", () => {
  const control = {
    activeWorks: [],
    apiRetry: { reasonCode: "fault.network.sseStalled", attempt: 1 },
  } as Parameters<typeof conversationLiveActivity>[1];
  assert.equal(
    conversationLiveActivity([], control).retryReasonMessageId,
    "chat.activity.reason.stalled",
  );
});
