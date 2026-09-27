import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWeixinIntent, weixinIntentPrompt } from "../src/bots/weixinIntent.js";
test("strict model routing supports all output types", () => {
  for (const kind of ["chat", "photo", "pdf", "chart"])
    assert.equal(
      parseWeixinIntent(JSON.stringify({ kind, prompt: "fixture", useReference: false })).kind,
      kind,
    );
  assert.throws(() => parseWeixinIntent('{"kind":"shell","prompt":"x","useReference":false}'));
  assert.throws(() => parseWeixinIntent('{"kind":"photo","prompt":"x","useReference":"false"}'));
  assert.match(weixinIntentPrompt("生成PDF", false), /生成PDF/);
});
