import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createComputerUseRuntime } from "../index.js";

test("Windows and Linux MCP executors enforce observation and session boundaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-cua-mcp-test-"));
  const executable = join(directory, "fake-mcp");
  await writeFile(
    executable,
    `#!/usr/bin/env node
const readline = require('node:readline');
(async () => {
  for await (const line of readline.createInterface({input: process.stdin})) {
    const request = JSON.parse(line);
    if (!('id' in request)) continue;
    let result = {};
    if (request.method === 'initialize') result = {protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fake',version:'1'}};
    if (request.method === 'tools/list') result = {tools:[{name:'get_app_state',inputSchema:{type:'object'}},{name:'click',inputSchema:{type:'object'}},{name:'run_shell',inputSchema:{type:'object'}}]};
    if (request.method === 'tools/call') result = {content:[{type:'text',text:JSON.stringify({tool:request.params.name})},...(request.params.name==='get_app_state'?[{type:'image',mimeType:'image/png',data:'aW1hZ2U='}]:[])]};
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
  }
})().catch(e => { console.error(e); process.exitCode=1; });
`,
  );
  await chmod(executable, 0o755);
  const contexts = [
    { workspaceKey: "workspace", sessionId: "one", runtimeScope: "main" },
    { workspaceKey: "workspace", sessionId: "two", runtimeScope: "main" },
  ];
  try {
    for (const platform of ["win32", "linux"]) {
      const runtime = createComputerUseRuntime({
        platform,
        env: { ZCODE_CUA_DEV_MODE: "1", ZCODE_CUA_EXECUTOR_PATH: executable },
      });
      try {
        const described = await runtime.execute({
          toolName: "platform.describe",
          context: contexts[0],
        });
        const tools = JSON.parse(described.content[0].text).tools;
        assert.deepEqual(
          tools.map((tool) => tool.name),
          ["get_app_state", "click"],
        );
        const denied = await runtime.execute({
          toolName: "platform.call",
          context: contexts[0],
          arguments: { name: "click", arguments: { element_index: "1" } },
        });
        assert.equal(denied.isError, true);
        const observed = await runtime.execute({
          toolName: "platform.call",
          context: contexts[0],
          arguments: { name: "get_app_state", arguments: { app: "Notepad" } },
        });
        assert.equal(observed.content.find((item) => item.type === "image")?.data, "aW1hZ2U=");
        const snapshotId = JSON.parse(observed.content.at(-1).text).zcodeSnapshotId;
        const crossSession = await runtime.execute({
          toolName: "platform.call",
          context: contexts[1],
          arguments: { name: "click", arguments: { element_index: "1" }, snapshotId },
        });
        assert.equal(crossSession.isError, true);
        const clicked = await runtime.execute({
          toolName: "platform.call",
          context: contexts[0],
          arguments: { name: "click", arguments: { element_index: "1" }, snapshotId },
        });
        assert.equal(clicked.isError, undefined);
        const replay = await runtime.execute({
          toolName: "platform.call",
          context: contexts[0],
          arguments: { name: "click", arguments: { element_index: "1" }, snapshotId },
        });
        assert.equal(replay.isError, true);
        const shell = await runtime.execute({
          toolName: "platform.call",
          context: contexts[0],
          arguments: { name: "run_shell", arguments: {} },
        });
        assert.equal(shell.isError, true);
      } finally {
        await runtime.dispose();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
