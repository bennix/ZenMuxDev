import assert from "node:assert/strict";
import { test } from "node:test";
import { hasTaskActivitySoundEvent } from "../src/lib/taskActivitySoundEvents.js";
test("new interaction rings once and repeated snapshots are silent", () => {
  const next = new Map([["interaction:i", "pending"]]);
  assert.equal(hasTaskActivitySoundEvent(new Map(), next), true);
  assert.equal(hasTaskActivitySoundEvent(next, next), false);
});
test("observed stage and child completion trigger sound, historical completion does not", () => {
  for (const [key, status] of [
    ["segment:s", "done"],
    ["work:w", "resultPending"],
    ["work:w", "failed"],
  ]) {
    const next = new Map([[key!, status!]]);
    assert.equal(hasTaskActivitySoundEvent(new Map([[key!, "running"]]), next), true);
    assert.equal(hasTaskActivitySoundEvent(new Map(), next), false);
  }
});
