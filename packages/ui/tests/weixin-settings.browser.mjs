import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const server = await createServer({
  configFile: false,
  plugins: [{ name: "weixin-test-page", configureServer(server) { server.middlewares.use((request, response, next) => { if (request.url !== "/") return next(); response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><html><body></body></html>"); }); } }],
  root: process.cwd(),
  server: { port: 0 },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async () => {
    const { React, createRoot } = await import("/packages/ui/tests/weixin-react-entry.js");
    const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
    const { ProviderSettingsCard } =
      await import("/packages/ui/src/BotsDialog/ProviderSettingsCard.tsx");
    const { WeixinEchoSetting } = await import("/packages/ui/src/BotsDialog/WeixinEchoSetting.tsx");
    function Probe() {
      const [enabled, setEnabled] = React.useState(true);
      return React.createElement(
        ZCodeIntlProvider,
        { initialLocale: "zh-CN" },
        React.createElement(WeixinEchoSetting, { enabled, onChange: setEnabled }),
        React.createElement(ProviderSettingsCard, {
          bot: { id: "b", provider: "weixin", enabled: true, name: "Test" },
          credentialValue: "",
          bindCode: null,
          bindExpired: false,
          bindRemainingMs: 0,
          bindCountdownProgress: 0,
          feishuRegistration: null,
          feishuRegistrationLoading: false,
          weixinRegistrationLoading: false,
          weixinActivated: false,
          secretSaving: false,
          weixinRegistration: {
            botId: "b",
            qrCode: "poll-key",
            qrUrl: "https://example.test/scan",
            qrDataUrl: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
            interval: 3,
            expiresAt: Date.now() + 60000,
            status: "need_verifycode",
          },
          onSubmitWeixinVerification: (code) => {
            window.submittedVerification = code;
          },
        }),
      );
    }
    document.body.innerHTML = '<div id="app"></div>';
    createRoot(document.getElementById("app")).render(React.createElement(Probe));
  });
  const toggle = page.getByRole("switch", { name: "文字连通测试（Echo）" });
  await toggle.waitFor();
  assert.equal(await toggle.getAttribute("aria-checked"), "true");
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  await page.getByRole("textbox", { name: "手机显示的验证码" }).fill("123456");
  await page.getByRole("button", { name: "验证", exact: true }).click();
  assert.equal(await page.evaluate(() => window.submittedVerification), "123456");
  assert.equal(await page.getByRole("textbox", { name: "手机显示的验证码" }).inputValue(), "");
  console.log(
    "Weixin settings browser checks passed: controlled echo switch and QR verification submission",
  );
} finally {
  await browser.close();
  await server.close();
}
