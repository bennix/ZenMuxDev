import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGuideStreamHandoff } from '../src/runtime/methods/guide-stream-handoff.js';
test('guide interrupts pure stream without cancelling turn', () => {
 const turn = new AbortController(); let pending = false;
 const handoff = createGuideStreamHandoff(turn.signal, () => pending);
 handoff.checkpoint(); assert.equal(handoff.signal.aborted, false);
 pending = true; handoff.checkpoint();
 assert.equal(handoff.interrupted, true); assert.equal(turn.signal.aborted, false);
});
test('running tools defer guide to normal boundary', () => {
 const handoff = createGuideStreamHandoff(new AbortController().signal, () => true);
 handoff.toolStarted(); handoff.checkpoint(); assert.equal(handoff.interrupted, false);
});
test('user Stop takes priority over guide continuation', () => {
 const turn = new AbortController(); const handoff = createGuideStreamHandoff(turn.signal, () => true);
 handoff.checkpoint(); turn.abort(); assert.equal(handoff.interrupted, false);
});
