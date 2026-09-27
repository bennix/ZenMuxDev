import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const server = await createServer({ configFile: false, root: process.cwd(), server: { port: 0 }, resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } }, plugins: [{ name: "fixture", configureServer(server) { server.middlewares.use((req, res, next) => { if (req.url !== "/") return next(); res.setHeader("Content-Type", "text/html"); res.end('<html><body><div id="app"></div></body></html>'); }); } }] });
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async () => {
    const { React, createRoot } = await import("/packages/ui/tests/weixin-react-entry.js");
    const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
    const { ProviderModelApiFormats } = await import("/packages/ui/src/settings/model-provider-section/ProviderModelApiFormats.tsx");
    const { resolvePendingProviderDraftSave } = await import("/packages/ui/src/settings/model-provider-section/ProviderDraftSave.ts");
    let provider = { providerId: "test", providerName: "ZenMux", config: { api: { type: "openai-chat-completions", baseUrl: "https://example.com", headers: { "X-Title": "ZenCoder" }, modelApiTypes: { grok: "openai-responses" } } }, personalConfig: {} };
    const root = createRoot(document.getElementById("app"));
    function render() {
      root.render(React.createElement(ZCodeIntlProvider, { initialLocale: "zh-CN" }, React.createElement(ProviderModelApiFormats, { models: [{ modelId: "grok" }], value: JSON.stringify(provider.config.api.modelApiTypes), onChange(value) {
        provider = resolvePendingProviderDraftSave({ provider, draft: { nameValue: "ZenMux", apiFormat: "openai-chat-completions", baseUrlValue: "https://example.com", apiKeyValue: "", modelApiTypesValue: value }, now: Date.now });
        window.savedProvider = provider;
        render();
      } })));
    }
    render();
  });
  const select = page.getByTestId("model-api-grok");
  await select.waitFor();
  assert.match(await select.innerText(), /Responses/);
  await select.click();
  await page.getByRole("option", { name: "跟随供应商协议", exact: true }).click();
  assert.equal(await page.evaluate(() => window.savedProvider.personalConfig.api.modelApiTypes.grok), null);
  await select.click();
  await page.getByRole("option", { name: /Responses/ }).click();
  const saved = await page.evaluate(() => window.savedProvider);
  assert.equal(saved.personalConfig.api.modelApiTypes.grok, "openai-responses");
  assert.equal(saved.config.api.type, "openai-chat-completions");
  assert.equal(saved.config.api.headers["X-Title"], "ZenCoder");
  assert.match(await select.innerText(), /Responses/);
  console.log("PASS model protocol UI selection and persisted draft");
} finally { await browser.close(); await server.close(); }
