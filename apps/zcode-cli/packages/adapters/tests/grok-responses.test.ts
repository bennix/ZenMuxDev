import assert from "node:assert/strict";
import { test } from "node:test";
import { ProviderConfig, ProviderApiConfig, ApiKeyAccessConfig, createRegistryProviderConfig } from "@zcode/provider";
import { AiSdkModelExecution } from "../src/model/model-execution.js";

test("Grok file is serialized to Responses input_file, not Chat Completions", async () => {
  let url = "";
  let body: Record<string, unknown> = {};
  const execution = new AiSdkModelExecution({}, { transport: async (input, init) => {
    url = String(input);
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "resp_test", created_at: 1, model: "x-ai/grok-4.7", output: [], usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 } }), { headers: { "content-type": "application/json" } });
  } });
  const config = createRegistryProviderConfig(new ProviderConfig({ group: "standard-personal", access: new ApiKeyAccessConfig({ apiKey: "test" }), api: new ProviderApiConfig({ type: "openai-chat-completions", baseUrl: "https://zenmux.ai/api/v1", modelApiTypes: { "x-ai/grok-4.7": "openai-responses" } }) }));
  if (!config.ok) throw new Error("invalid fixture");
  const resolved = execution.bindModel({ providerId: "zenmux", modelId: "x-ai/grok-4.7", providerConfig: config.config, supportsJsonSchemaOutput: false, optionSpecs: { reasoningLevel: { map: "{}" }, maxOutputTokens: { map: "{}" } } }).resolved;
  assert.equal(resolved.providerOptions?.apiFormat, "openai-responses");
  await resolved.model.doGenerate({ prompt: [{ role: "user", content: [{ type: "file", mediaType: "application/pdf", filename: "test.pdf", data: new Uint8Array([37,80,68,70]) }] }] });
  assert.equal(url, "https://zenmux.ai/api/v1/responses");
  assert.match(JSON.stringify(body.input), /input_file/);
  assert.equal(body.messages, undefined);
});
