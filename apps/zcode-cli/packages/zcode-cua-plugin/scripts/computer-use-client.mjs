import { randomUUID } from "node:crypto";

/** 模块在宿主 realm 加载；bridge 必须从调用方 REPL 的 globals 显式传入。 */
export function setupComputerUseRuntime({ globals }) {
  const bridge = globals[Symbol.for("zcode.node-repl.computer-use-bridge")];
  if (!bridge) throw new Error("Computer Use bridge is unavailable in this node_repl session");
  bridge.assertAvailable();
  const nodeRepl = globals.nodeRepl;

  async function call(method, params = {}, raw = false) {
    const result = await bridge.call(method, params);
    nodeRepl.emitStructuredResult(result);
    if (raw) return result;
    const first = result.content?.find((item) => item.type === "text");
    return first ? JSON.parse(first.text) : result;
  }

  return Object.freeze({
    permissions: (prompt = false) => call("permissions.check", { prompt }),
    listApps: () => call("apps.list"),
    listWindows: () => call("window.list"),
    launch: (app) => call("apps.launch", { app, waitForWindowMs: 8000 }),
    observe: (target, includeImage = false) => call("observe", { target, includeImage }),
    click: ({ snapshotId, elementToken, digest }) =>
      call("dispatch.element", {
        snapshotId,
        elementToken,
        expectElementDigest: digest,
        toolCallId: randomUUID(),
        strictness: "element",
        occlusionPolicy: "same_app",
        action: { kind: "click", button: "left", count: 1 },
        observeAfter: { includeImage: false, settle: "quiesce" },
      }),
    setValue: ({ snapshotId, elementToken, digest, value }) =>
      call("dispatch.element", {
        snapshotId,
        elementToken,
        expectElementDigest: digest,
        toolCallId: randomUUID(),
        strictness: "element",
        occlusionPolicy: "same_app",
        action: { kind: "set_value", value },
        observeAfter: { includeImage: false, settle: "quiesce" },
      }),
    key: ({ snapshotId, focusToken, digest, key, modifiers = [] }) =>
      call("dispatch.key", {
        snapshotId,
        focusToken,
        expectElementDigest: digest,
        toolCallId: randomUUID(),
        focusPolicy: "require",
        action: { kind: "key", key, modifiers },
        observeAfter: { includeImage: false, settle: "quiesce" },
      }),
    type: ({ snapshotId, focusToken, digest, text }) =>
      call("dispatch.key", {
        snapshotId,
        focusToken,
        expectElementDigest: digest,
        toolCallId: randomUUID(),
        focusPolicy: "acquire",
        action: { kind: "type", text },
        observeAfter: { includeImage: false, settle: "quiesce" },
      }),
    screenshot: () => call("screen.capture"),
    platformTools: () => call("platform.describe"),
    platformCall: (name, args = {}, snapshotId) =>
      call("platform.call", { name, arguments: args, snapshotId }, true),
    stop: () => call("stop_computer_control"),
  });
}
