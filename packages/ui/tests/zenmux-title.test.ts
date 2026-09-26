import assert from "node:assert/strict";
import { test } from "node:test";
import { callZenMuxSystemOne, completeZenMuxChat, streamZenMuxChatCompletion, validateZenMuxApiKey } from "../../shared/src/zenmux.js";
import { createOmitZenMuxTemperatureFetch } from "../../../apps/zcode-cli/packages/adapters/src/model/omit-temperature-fetch.js";

test("ZenMux direct requests report ZenCoder", async () => {
  const seen: Headers[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    seen.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
  };
  await callZenMuxSystemOne("test", { state: "test", questions: {} }, undefined, fetchImpl);
  await completeZenMuxChat({ apiKey: "test", model: "test", messages: [], fetchImpl });
  await validateZenMuxApiKey("test", undefined, fetchImpl);
  await streamZenMuxChatCompletion({ apiKey: "test", model: "test", messages: [], onDelta: () => {}, fetchImpl: async (_input, init) => {
    seen.push(new Headers(init?.headers));
    return new Response("data: [DONE]\n\n");
  }});
  assert.equal(seen.length, 4);
  for (const headers of seen) {
    assert.equal(headers.get("X-Title"), "ZenCoder");
    assert.equal(headers.get("Authorization"), "Bearer test");
  }
});

test("SDK requests override title only for ZenMux and retain headers/body rules", async () => {
  const fetchImpl = createOmitZenMuxTemperatureFetch(async (input, init) => {
    const request = new Request(input, init);
    if (request.url.includes("zenmux.ai")) {
      assert.equal(request.headers.get("X-Title"), "ZenCoder");
      assert.equal(request.headers.get("Authorization"), "Bearer test");
      if (request.method === "POST") assert.equal((await request.json()).temperature, undefined);
    } else assert.equal(request.headers.get("X-Title"), "Original");
    return new Response("OK");
  });
  const headers = { Authorization: "Bearer test", "X-Title": "Original", "Content-Type": "application/json" };
  await fetchImpl("https://zenmux.ai/api/v1/chat/completions", {method:"POST",headers,body:'{"temperature":1,"model":"test"}'});
  await fetchImpl(new Request("https://zenmux.ai/api/v1/models", {headers}));
  await fetchImpl("https://example.com/api", {headers});
});

test("media generation and video polling report the same application name", async () => {
  const { generateStudioImage, generateStudioVideo, blobFromUrl } = await import("../src/v4/composer/studio/mediaClient.js");
  const originalFetch = globalThis.fetch;
  const requests: { url: string; title: string | null }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({url, title:new Headers(init?.headers).get("X-Title")});
    if (url.endsWith(":predictLongRunning")) return Response.json({name:"test-operation"});
    if (url.endsWith(":fetchPredictOperation")) return Response.json({done:true,response:{url:"https://example.com/video.mp4"}});
    return Response.json({b64_json:"AA=="});
  };
  try {
    await generateStudioImage("test", "test", "openai/gpt-image-2");
    await generateStudioVideo("test", "test", null, new AbortController().signal);
    await blobFromUrl("https://example.com/image.png");
    assert.deepEqual(requests.map(request => request.title), ["ZenCoder","ZenCoder","ZenCoder",null]);
  } finally { globalThis.fetch = originalFetch; }
});
