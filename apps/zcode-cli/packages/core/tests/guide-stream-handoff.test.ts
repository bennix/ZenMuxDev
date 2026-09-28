import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGuideStreamHandoff, notifyGuideHandoff, subscribeGuideHandoff } from '../src/runtime/methods/guide-stream-handoff.js';
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

test('durable admission wakes silent request without a snapshot and preserves turn', async () => {
 const owner = {}; const turn = new AbortController(); let pending = false;
 const handoff = createGuideStreamHandoff(turn.signal, () => pending);
 const dispose = subscribeGuideHandoff(owner, handoff.checkpoint);
 const waiting = new Promise<void>(resolve => handoff.signal.addEventListener('abort', () => resolve(), { once: true }));
 pending = true; notifyGuideHandoff(owner); await waiting;
 assert.equal(handoff.interrupted, true); assert.equal(turn.signal.aborted, false); dispose();
});
test('subscription catches prior admission and stale cleanup preserves new request', () => {
 const owner = {}; let first = 0; let second = 0;
 const old = subscribeGuideHandoff(owner, () => first++);
 const current = subscribeGuideHandoff(owner, () => second++);
 old(); notifyGuideHandoff(owner); notifyGuideHandoff({});
 assert.equal(first, 1); assert.equal(second, 2);
 current(); notifyGuideHandoff(owner); assert.equal(second, 2);
});
test('admission notification cannot interrupt tools or override Stop', () => {
 const owner = {}; const turn = new AbortController(); let pending = false;
 const handoff = createGuideStreamHandoff(turn.signal, () => pending);
 const dispose = subscribeGuideHandoff(owner, handoff.checkpoint);
 handoff.toolStarted(); pending = true; notifyGuideHandoff(owner);
 assert.equal(handoff.signal.aborted, false);
 turn.abort(); notifyGuideHandoff(owner); assert.equal(handoff.interrupted, false); dispose();
});
