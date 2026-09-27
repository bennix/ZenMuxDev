import assert from "node:assert/strict";
import { test } from "node:test";
import { studioImageHttpError } from "../../shared/src/studio-image.js";
import { generateWeixinImage } from "../src/bots/weixinImageGeneration.js";
test("provider rejection explains safety and preserves request ID without raw secrets", () => {
  const message = studioImageHttpError(400, {
    error: {
      message: "Rejected by the safety system token=secret",
      code: "content_policy_violation",
    },
    request_id: "fixture-123",
  });
  assert.match(message, /安全/);
  assert.match(message, /fixture-123/);
  assert.doesNotMatch(message, /secret/);
});
test("Weixin HTTP 400 retains cause and does not resubmit", async () => {
  let calls = 0;
  await assert.rejects(
    generateWeixinImage({
      apiKey: "fixture",
      model: "openai/gpt-image-2.5-sunburst",
      prompt: "cat",
      images: [],
      fetchImpl: async () => {
        calls++;
        return Response.json(
          {
            error: { message: "Invalid imageSize", code: "invalid_argument" },
            request_id: "fixture-456",
          },
          { status: 400 },
        );
      },
    }),
    /尺寸.*fixture-456/,
  );
  assert.equal(calls, 1);
});
