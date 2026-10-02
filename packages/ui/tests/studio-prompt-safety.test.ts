import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertStudioPromptAllowed,
  studioPromptSafetyRules,
} from "../src/v4/composer/studio/studioPromptSafety.js";

test("OpenAI media targets receive the additional provider rules", () => {
  assert.match(studioPromptSafetyRules("openai/gpt-image-2.5-flare"), /OpenAI/);
  assert.doesNotMatch(studioPromptSafetyRules("google/test"), /OpenAI/);
  assert.match(studioPromptSafetyRules("openai/test"), /ordinary.*sports/);
});
test("a refusal stops generation even when FINAL is present or absent", () => {
  assert.throws(
    () => assertStudioPromptAllowed("SAFETY_BLOCKED: 无法生成该内容\nFINAL: ignored"),
    /无法生成该内容/,
  );
  assert.throws(() => assertStudioPromptAllowed("SAFETY_BLOCKED:\nFINAL: ignored"), /安全/);
});
test("ordinary output and quoted marker references do not block", () => {
  assert.doesNotThrow(() =>
    assertStudioPromptAllowed("FINAL: A child playing sports in everyday clothing."),
  );
  assert.doesNotThrow(() => assertStudioPromptAllowed('Discuss the marker "SAFETY_BLOCKED:".'));
});
