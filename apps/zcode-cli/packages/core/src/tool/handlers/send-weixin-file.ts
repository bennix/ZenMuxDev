import { weixinFileRequestSchema, weixinFileResultSchema } from "@zcode/shared";
import type { ToolEntry } from "../types.js";

const TIMEOUT = 120_000;
const BUDGET = 8_000;
export const sendWeixinFileToolEntry: ToolEntry = {
  capability: "Send a workspace file to a bound Weixin account at the user's explicit request",
  metadata: {
    name: "SendWeixinFile",
    description: "List bound Weixin recipients (action=list), or send an existing workspace file (action=send, path, recipientId). Use when the user asks to send a generated PDF, image, document or other file to 微信/Weixin. First resolve the actual file from conversation or tools. List recipients first; by user preference the first recipient is the most recently active authorized channel and is the default. Omit recipientId for the default so the host resolves the latest channel at send time; only set it for an explicitly requested recipient. Ask only if the file is ambiguous. Never send just because a file was generated. Only report sent when sent=true. On failure do not automatically retry: delivery may be uncertain.",
    readOnly: false, destructive: false, concurrentSafe: false, timeoutMs: TIMEOUT,
    maxOutputBytes: BUDGET, sideEffectScope: "network", riskLevel: "medium", needsApproval: true,
  },
  inputSchema: { type: "object", properties: { action: { type: "string", enum: ["list", "send"] }, path: { type: "string" }, recipientId: { type: "string" } }, required: ["action"], additionalProperties: false },
  outputSchema: { type: "object", properties: { recipients: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"], additionalProperties: false } }, sent: { type: "boolean" } }, required: ["recipients", "sent"], additionalProperties: false },
  handler: async (input, context) => {
    if (!context.weixinFilePort) throw new Error("当前宿主不支持微信文件发送");
    return weixinFileResultSchema.parse(await context.weixinFilePort(weixinFileRequestSchema.parse(input)));
  },
  permission: { permission: "weixin.sendFile", reason: "Send a file to the user's bound Weixin account", riskLevel: "medium", sideEffectScope: "network", needsApproval: true, patternSources: ["toolName", "input"], denyPriority: "beforeAsk" },
  resultBudget: { maxInlineBytes: BUDGET, maxModelBytes: BUDGET, strategy: "truncate", preview: { maxBytes: BUDGET, direction: "head" } },
  timeout: { defaultMs: TIMEOUT, maxMs: TIMEOUT, allowCallOverride: false },
  cancellation: { supported: false, cleanup: "none", userVisibleMessage: "An in-flight Weixin send cannot be recalled. Check delivery before retrying." },
  trace: { required: true, propagateToAdapters: true, recordInput: "summary", recordOutput: "summary" },
};
