import assert from "node:assert/strict";
import { test } from "node:test";
import { currentScopedLease } from "../src/v4/scopedSessionLease.js";

test("new task and task switches cannot expose old results before effects release leases", () => {
  const owner = {};
  const lease = { rows: ["old result"], error: "old error" };
  const binding = { owner, lease, sessionId: "A" };
  assert.equal(currentScopedLease(binding, owner, "A"), lease);
  assert.equal(currentScopedLease(binding, owner, null), null);
  assert.equal(currentScopedLease(binding, owner, "B"), null);
  assert.equal(currentScopedLease(binding, {}, "A"), null);
  assert.deepEqual(lease.rows, ["old result"]);
});

test("draft prewarm remains accessible only in the same draft scope", () => {
  const owner = {};
  const binding = { owner, lease: {}, sessionId: null };
  assert.equal(currentScopedLease(binding, owner, null), binding.lease);
  assert.equal(currentScopedLease(binding, owner, "B"), null);
  assert.equal(currentScopedLease(null, owner, null), null);
});
