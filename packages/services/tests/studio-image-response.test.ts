import assert from "node:assert/strict";
import { test } from "node:test";
import { extractStudioImage, requireStudioImage } from "../../shared/src/studio-image.js";
test("Gemini inline images support both field conventions and preserve MIME", () => {
  for (const part of [
    { inlineData: { data: "AQID", mimeType: "image/webp" } },
    { inline_data: { data: "AQID", mime_type: "image/webp" } },
  ])
    assert.equal(
      extractStudioImage({ candidates: [{ content: { parts: [{ text: "done" }, part] } }] }),
      "data:image/webp;base64,AQID",
    );
});
test("Gemini failures are explicit and retain model and response ID", () => {
  for (const [payload, reason] of [
    [{ promptFeedback: { blockReason: "SAFETY" } }, /拦截.*SAFETY/],
    [{ candidates: [{ finishReason: "MAX_TOKENS" }] }, /长度限制/],
    [{ candidates: [{ finishReason: "SAFETY" }] }, /拦截.*SAFETY/],
    [{ candidates: [{ content: { parts: [{ text: "hello" }] } }] }, /只返回了文字/],
    [{ candidates: [] }, /空响应/],
  ] as const) {
    assert.throws(
      () =>
        requireStudioImage(
          { ...payload, responseId: "fixture-123" },
          "google/gemini-2.5-flash-image",
        ),
      (error) =>
        error instanceof Error &&
        reason.test(error.message) &&
        error.message.includes("fixture-123") &&
        error.message.includes("gemini-2.5-flash-image"),
    );
  }
});
