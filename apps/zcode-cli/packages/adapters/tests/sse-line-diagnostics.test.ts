import assert from "node:assert/strict";
import { test } from "node:test";
import { createSseLineDiagnostics } from "../src/model/sse-line-diagnostics.js";
test("classifies split SSE fields without retaining payloads or counting data contents", () => {
  const first: string[] = [];
  const d = createSseLineDiagnostics((kind) => first.push(kind));
  const wire =
    ': heartbeat\r\n\r\nevent: message_start\ndata: {"text":"secret:data:"}\n\n: another\n';
  for (const byte of new TextEncoder().encode(wire)) d.observe(Uint8Array.of(byte));
  assert.deepEqual(d.counts, { commentLines: 2, eventLines: 1, dataLines: 1 });
  assert.deepEqual(first, ["commentLines", "eventLines", "dataLines", "other_data"]);
  assert.equal(JSON.stringify(d).includes("secret"), false);
});
