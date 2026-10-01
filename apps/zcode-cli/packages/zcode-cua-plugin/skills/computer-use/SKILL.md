---
name: computer-use
description: Control macOS, Windows, and Linux desktop applications through ZenCode's native Computer Use executor, when the user enables the installed Computer Use plugin. Main agent only.
---

# Computer Use

Use `mcp__node_repl__js` for the user's desktop application task. Every call starts fresh, so import the client in every call:

```js
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");
const root = process.env.ZCODE_CUA_PLUGIN_ROOT;
if (!root) throw new Error("Computer Use plugin is not enabled");
const { setupComputerUseRuntime } = await import(
  pathToFileURL(join(root, "scripts", "computer-use-client.mjs")).href
);
const computerUse = setupComputerUseRuntime({ globals: globalThis });
```

On macOS, first call `await computerUse.permissions()` and `await computerUse.listApps()`. Choose an application by its exact `appId`, then call `await computerUse.observe({kind:"app",app:appId})`. For an application that is not running, use `computerUse.launch(appName)` and use the returned `appId`. Read the returned `snapshot.snapshotId` and an element's `token` and `digest` before calling `click({snapshotId,elementToken:token,digest})` or `setValue`. For keyboard input use the observation's `focusedElementToken` and the matching element digest with `key` or `type`.

On Windows or Linux, first call `await computerUse.platformTools()` to read the native tool schemas. On Linux, call `await computerUse.platformCall("doctor", {})` and explain any blockers. Use `platformCall("list_apps", {})`, then `platformCall("get_app_state", {app: appName})` on Windows or `platformCall("get_app_state", {app_name_or_bundle_identifier: appName})` on Linux. Read `zcodeSnapshotId` from the last text content block. Pass it as the third argument to one mutating call, for example `await computerUse.platformCall("click", {app: appName, element_index: "1"}, snapshotId)`. Follow the schemas returned for that platform and reobserve after every action.

Use `nodeRepl.write` only for a short status; the client emits the structured result itself. A stale or spent snapshot requires a new observation. Never repeat an action whose result is `outcome_unknown`.

For macOS screenshots use `computerUse.screenshot()`; on Windows and Linux use the image content of `get_app_state` or a listed `screenshot` tool. Use `computerUse.stop()` to release the native session. Do not use shell or AppleScript to bypass the user's plugin choice.
