import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  ApiKeyAccessConfig,
  ProviderApiConfig,
  ProviderConfig,
} from "../src/config/provider-config.js";
import { createRegistryProviderConfig, serializeRegistryProviderConfig } from "../src/resolver.js";

test("ZenMux Grok alone defaults to Responses and survives serialization", async () => {
  const builtins = JSON.parse(
    await readFile(new URL("../../../config/provider/zcode-builtin.json", import.meta.url), "utf8"),
  );
  const template = builtins.config.providerConfigRules.templateRules.find(
    (r: { templateId: string }) => r.templateId === "zenmux",
  );
  const api = new ProviderApiConfig(template.config.api);
  assert.equal(api.resolveModelApiType("x-ai/grok-4.7"), "openai-responses");
  assert.equal(api.resolveModelApiType("anthropic/claude-opus-5.5"), "openai-chat-completions");
  const config = new ProviderConfig({
    ...template.config,
    api,
    group: "standard-personal",
    access: new ApiKeyAccessConfig({ apiKey: "test" }),
  });
  const result = createRegistryProviderConfig(config);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("invalid fixture");
  assert.deepEqual(
    serializeRegistryProviderConfig(result.config).api.modelApiTypes,
    api.modelApiTypes,
  );
});

test("personal override, inheritance and invalid protocol", () => {
  const base = new ProviderApiConfig({
    type: "openai-chat-completions",
    baseUrl: "https://example.com",
    modelApiTypes: { grok: "openai-responses", other: "anthropic-messages" },
  });
  assert.equal(
    base
      .overlay(new ProviderApiConfig({ modelApiTypes: { grok: null } }))
      .resolveModelApiType("grok"),
    "openai-chat-completions",
  );
  const edited = base.overlay(
    new ProviderApiConfig({ modelApiTypes: { grok: "anthropic-messages" } }),
  );
  assert.equal(edited.resolveModelApiType("grok"), "anthropic-messages");
  assert.equal(edited.resolveModelApiType("other"), "anthropic-messages");
  assert.equal(
    new ProviderApiConfig(edited.toJSON()).resolveModelApiType("grok"),
    "anthropic-messages",
  );
  assert.ok(
    new ProviderApiConfig({
      ...base.toJSON(),
      modelApiTypes: { grok: "invalid" as never },
    }).validateComplete().length,
  );
});
