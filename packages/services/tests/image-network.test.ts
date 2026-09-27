import assert from "node:assert/strict";
import { test } from "node:test";
import { imageNetworkStage, withImageConnectRetry } from "../src/bots/imageNetwork.js";
import { generateWeixinImage } from "../src/bots/weixinImageGeneration.js";

test("connect failures retry at most three times, ambiguous failures never retry", async () => {
  for (const [code, expected] of [
    ["UND_ERR_CONNECT_TIMEOUT", 3],
    ["ECONNRESET", 1],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      withImageConnectRetry(async () => {
        calls++;
        throw new TypeError("fetch failed", { cause: Object.assign(new Error(), { code }) });
      })("https://example.com"),
      /fetch failed/,
    );
    assert.equal(calls, expected);
  }
});
test("diagnostics retain stage and safe code without exposing signed URLs", async () => {
  await assert.rejects(
    imageNetworkStage("上传", async () => {
      throw new Error("https://example.com?token=secret");
    }),
    (error) =>
      error instanceof Error && error.message.includes("上传") && !error.message.includes("secret"),
  );
});
test("generation uses injected transport and recovers preconnect failure", async () => {
  let calls = 0;
  const result = await generateWeixinImage({
    apiKey: "fixture",
    model: "openai/gpt-image-2.5-flare",
    prompt: "cat",
    images: [],
    fetchImpl: async () => {
      if (++calls === 1) throw Object.assign(new Error(), { code: "ECONNREFUSED" });
      return Response.json({
        predictions: [{ bytesBase64Encoded: "AQID", mimeType: "image/png" }],
      });
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.data, Buffer.from([1, 2, 3]));
});
