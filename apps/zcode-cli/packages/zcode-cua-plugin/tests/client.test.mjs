import assert from "node:assert/strict";
import { test } from "node:test";

test("Computer Use client forwards bound snapshot tokens through the bridge", async () => {
  const calls = [];
  const emitted = [];
  const symbol = Symbol.for("zcode.node-repl.computer-use-bridge");
  const globals = {
    [symbol]: {
      assertAvailable() {},
      async call(method, params) {
        calls.push({ method, params });
        return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
      },
    },
    nodeRepl: { emitStructuredResult: (result) => emitted.push(result) },
  };
  {
    const { setupComputerUseRuntime } = await import("../scripts/computer-use-client.mjs");
    const computerUse = setupComputerUseRuntime({ globals });
    await computerUse.click({
      snapshotId: "snapshot",
      elementToken: "token",
      digest: "sha256:abc",
    });
    assert.equal(calls[0].method, "dispatch.element");
    assert.equal(calls[0].params.snapshotId, "snapshot");
    assert.equal(calls[0].params.elementToken, "token");
    assert.equal(calls[0].params.expectElementDigest, "sha256:abc");
    const result = await computerUse.platformCall("click", { element_index: "1" }, "native-snapshot");
    assert.equal(calls[1].method, "platform.call");
    assert.deepEqual(calls[1].params, {
      name: "click",
      arguments: { element_index: "1" },
      snapshotId: "native-snapshot",
    });
    assert.equal(result, emitted[1]);
    assert.equal(emitted.length, 2);
  }
});
