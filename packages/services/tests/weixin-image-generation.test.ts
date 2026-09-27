import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStudioImageRequest } from "../../shared/src/studio-image.js";
import {
  resolveWeixinImageRequest,
  recentWeixinPhotos,
} from "../src/bots/weixinImageGeneration.js";

test("system image model is preserved and reference photo is included", () => {
  const req = buildStudioImageRequest("openai/gpt-image-2", "edit photo", [
    { data: "AQ==", mimeType: "image/png" },
  ]);
  assert.match(req.url, /openai\/models\/gpt-image-2:predict$/);
  assert.deepEqual((req.body as any).instances[0].referenceImages[0].referenceImage, {
    bytesBase64Encoded: "AQ==",
    mimeType: "image/png",
  });
});
test("capability questions do not become paid image requests", () => {
  assert.equal(resolveWeixinImageRequest("能够生成图像吗？", false)?.kind, "help");
  assert.equal(resolveWeixinImageRequest("解释这张照片", true), null);
  assert.equal(resolveWeixinImageRequest("/image 一只猫", false)?.kind, "generate");
  assert.equal(resolveWeixinImageRequest("把这张照片改成水彩画", true)?.kind, "generate");
});

test("default-model generation uses real image response and application header", async () => {
  const { generateWeixinImage } = await import("../src/bots/weixinImageGeneration.js");
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /google\/models\/gemini-2.5-flash-image:generateContent$/);
    assert.equal(new Headers(init?.headers).get("X-Title"), "ZenCoder");
    assert.equal(JSON.parse(String(init?.body)).contents[0].parts[1].inlineData.data, "AQ==");
    return Response.json({
      candidates: [
        { content: { parts: [{ inlineData: { mimeType: "image/png", data: "AQID" } }] } },
      ],
    });
  };
  try {
    const image = await generateWeixinImage({
      apiKey: "fixture",
      model: "google/gemini-2.5-flash-image",
      prompt: "watercolor",
      images: [{ data: "AQ==", mimeType: "image/png" }],
    });
    assert.deepEqual(image.data, Buffer.from([1, 2, 3]));
  } finally {
    globalThis.fetch = original;
  }
});

test("reference photos are scoped to the sender and expire", () => {
  const state = {
    recentWeixinPhotos: {
      userId: "owner",
      savedAt: 1000,
      images: [{ localPath: "fixture.png", mimeType: "image/png" }],
    },
  };
  assert.equal(recentWeixinPhotos(state, "owner", 2000).length, 1);
  assert.equal(recentWeixinPhotos(state, "other", 2000).length, 0);
  assert.equal(recentWeixinPhotos(state, "owner", 1801000).length, 0);
});
