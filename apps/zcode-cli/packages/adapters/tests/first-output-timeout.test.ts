import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstOutputWaitMs, isEffectiveModelOutput } from '../src/model/stream-idle-timeout.js';
test('first output deadline stays within two minutes despite prelude and retries', () => {
 assert.equal(firstOutputWaitMs(0, 0, 600000, false), 120000);
 assert.equal(firstOutputWaitMs(0, 119000, 900000, false), 1000);
 assert.equal(firstOutputWaitMs(0, 120001, 0, false), 1);
 assert.equal(isEffectiveModelOutput({type:'start-step'}), false);
 assert.equal(isEffectiveModelOutput({type:'text-delta', text:''}), false);
 for (const type of ['text-delta', 'reasoning-delta', 'tool-input-delta']) {
  assert.equal(isEffectiveModelOutput({type, delta:'x'}), true);
 }
 assert.equal(isEffectiveModelOutput({type:'tool-call'}), true);
 assert.equal(firstOutputWaitMs(0, 200000, 600000, true), 600000);
});
