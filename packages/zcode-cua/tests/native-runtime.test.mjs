import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createComputerUseRuntime } from "../index.js";

test(
  "native runtime owns session ids and forwards only supported methods",
  { skip: process.platform !== "darwin" },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "zcode-cua-test-"));
    const executable = join(directory, "fake-executor");
    await writeFile(
      executable,
      `#!/usr/bin/env node
const readline = require('node:readline');
(async () => {
for await (const line of readline.createInterface({input:process.stdin})) {
  const request=JSON.parse(line);
  let result={ok:true};
  if(request.method==='host.hello') result={ok:true,protocol:'maka.cu/2'};
  if(request.method==='apps.list') result={ok:true,session:request.params.session,apps:[]};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
}
})().catch((error) => { process.stderr.write(String(error)); process.exitCode = 1; });
`,
    );
    await chmod(executable, 0o755);
    const runtime = createComputerUseRuntime({
      env: { ZCODE_CUA_DEV_MODE: "1", ZCODE_CUA_EXECUTOR_PATH: executable },
    });
    const context = { workspaceKey: "workspace", sessionId: "session", runtimeScope: "main" };
    try {
      const result = await runtime.execute({
        toolName: "apps.list",
        arguments: { session: "forged" },
        context,
      });
      const payload = JSON.parse(result.content[0].text);
      assert.equal(result.isError, false, result.content[0].text);
      assert.match(payload.session, /^zcode-/);
      assert.notEqual(payload.session, "forged");
      const denied = await runtime.execute({ toolName: "session.begin", context });
      assert.equal(denied.isError, true);
    } finally {
      await runtime.closeSession(context);
      await runtime.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
