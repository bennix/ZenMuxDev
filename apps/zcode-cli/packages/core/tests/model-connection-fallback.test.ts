import assert from "node:assert/strict";
import { test } from "node:test";
import { createConnectionFallbackGuard } from "../src/runtime/methods/model-connection-fallback.js";
test("switch only on third consecutive connection failure", () => {
  const guard = createConnectionFallbackGuard(true);
  for (let i = 0; i < 2; i++) guard.failed("timeout");
  assert.equal(guard.signal.aborted, false);
  guard.failed("network_error");
  assert.equal(guard.signal.aborted, true);
});
test("disabled, committed output and non-network errors never trigger fallback", () => {
  for (const mode of ["disabled", "output", "auth"]) {
    const guard = createConnectionFallbackGuard(mode !== "disabled");
    if (mode === "output") guard.markOutput();
    for (let i = 0; i < 10; i++) guard.failed(mode === "auth" ? "auth_failed" : "timeout");
    assert.equal(guard.signal.aborted, false);
  }
});
test("non-network failures reset the consecutive counter", () => {
  const guard = createConnectionFallbackGuard(true);
  for (let i = 0; i < 2; i++) guard.failed("timeout");
  guard.failed("invalid_request");
  guard.failed("timeout");
  assert.equal(guard.failures, 1);
  assert.equal(guard.signal.aborted, false);
});

test("handoff abort is immediate and cancellation does not erase its cause", () => {
  const guard = createConnectionFallbackGuard(true);
  guard.failed("stream_idle_timeout");
  guard.failed("timeout");
  assert.equal(guard.signal.aborted, false);
  guard.failed("network_error");
  assert.equal(guard.signal.aborted, true);
  guard.failed("cancelled");
  assert.equal(guard.failures, 3);
});
