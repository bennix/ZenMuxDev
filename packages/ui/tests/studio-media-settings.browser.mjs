import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { port: 0 },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
  plugins: [
    {
      name: "media-fixture",
      enforce: "pre",
      resolveId(id) {
        if (id.endsWith("/useSettingService.js") || id === "./useSettingService.js")
          return `${process.cwd()}/packages/ui/tests/studio-media-settings-fixture.ts`;
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== "/") return next();
          res.setHeader("Content-Type", "text/html");
          res.end('<html><body><div id="app"></div></body></html>');
        });
      },
    },
  ],
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async () => {
    const { React, createRoot } = await import("/packages/ui/tests/weixin-react-entry.js");
    const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
    const { StudioMediaSettings } =
      await import("/packages/ui/src/v4/composer/studio/StudioMediaSettings.tsx");
    createRoot(document.getElementById("app")).render(
      React.createElement(
        ZCodeIntlProvider,
        { initialLocale: "zh-CN" },
        React.createElement(StudioMediaSettings),
      ),
    );
  });
  await page.getByRole("radio", { name: "google/gemini-2.5-flash-image", exact: true }).click();
  assert.equal(
    await page
      .getByRole("radio", { name: "google/gemini-2.5-flash-image", exact: true })
      .isChecked(),
    true,
  );
  assert.equal(
    await page.getByRole("radio", { name: "openai/gpt-image-2", exact: true }).isChecked(),
    false,
  );
  await page.getByText("当前默认：google/gemini-2.5-flash-image", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.savedMedia.defaultImageId),
    "google/gemini-2.5-flash-image",
  );
  // 原生单选控件必须支持键盘；选中状态和顶部当前默认保持一致。
  await page.getByRole("radio", { name: "google/gemini-2.5-flash-image", exact: true }).focus();
  await page.keyboard.press("ArrowUp");
  await page.getByText("当前默认：openai/gpt-image-2", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("radio", { name: "openai/gpt-image-2", exact: true }).isChecked(),
    true,
  );
  await page.getByRole("radio", { name: "google/gemini-2.5-flash-image", exact: true }).check();
  await page.getByText("当前默认：google/gemini-2.5-flash-image", { exact: true }).waitFor();
  const request = await page.evaluate(async () => {
    const { buildStudioImageRequest } = await import("/packages/shared/src/studio-image.ts");
    return buildStudioImageRequest(window.savedMedia.defaultImageId, "watercolor", [
      { mimeType: "image/png", data: "AQ==" },
    ]);
  });
  assert.match(request.url, /gemini-2.5-flash-image:generateContent$/);
  assert.equal(request.body.contents[0].parts[1].inlineData.data, "AQ==");
  console.log("Media settings browser: selected default persists and photo request uses it.");
} finally {
  await browser.close();
  await server.close();
}
