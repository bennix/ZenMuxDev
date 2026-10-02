import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const server = await createServer({
  configFile: false,
  esbuild: { jsx: "automatic" },
  root: process.cwd(),
  server: { port: 0 },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
  plugins: [
    {
      name: "video-browser-fixture",
      enforce: "pre",
      resolveId(id) {
        if (id.endsWith("/useSettingService.js") || id === "./useSettingService.js")
          return `${process.cwd()}/packages/ui/tests/studio-video-browser-fixture.ts`;
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== "/") return next();
          res.setHeader("Content-Type", "text/html");
          res.end("<html><body></body></html>");
        });
      },
    },
  ],
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  const results = await page.evaluate(async () => {
    const { generateStudioVideo } =
      await import("/packages/ui/src/v4/composer/studio/mediaClient.ts");
    const originalTimeout = window.setTimeout;
    window.setTimeout = (callback, ms, ...args) =>
      originalTimeout(callback, ms === 15000 ? 5 : ms, ...args);
    const response = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "x-zenmux-requestid": "request-test" },
      });
    const run = async (model, kind) => {
      let calls = [];
      let polls = 0;
      let submits = 0;
      const controller = new AbortController();
      globalThis.fetch = async (url, init) => {
        calls.push({
          url: String(url),
          method: init.method,
          body: init.body ? JSON.parse(init.body) : null,
        });
        if (String(url).endsWith("/interactions"))
          return response({
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [{ type: "video", data: "AQ==", mime_type: "video/mp4" }],
              },
            ],
          });
        if (String(url).endsWith(":predictLongRunning") || String(url).endsWith("/videos")) {
          submits++;
          if (kind === "cancel") queueMicrotask(() => controller.abort());
          return response(
            String(url).endsWith("/videos")
              ? { id: "job-test", status: "queued" }
              : { name: "job-test" },
          );
        }
        polls++;
        if (kind === "404")
          return response({ error: { type: "invalid_model", message: "not found" } }, 404);
        if (kind === "transient" && polls === 1)
          return response({ error: { type: "provider_error", message: "temporary" } }, 503);
        return response(
          model.startsWith("google/veo-")
            ? { done: true, response: { videos: [{ gcsUri: "https://example.com/result.mp4" }] } }
            : { status: "succeeded", content: { video_url: "https://example.com/result.mp4" } },
        );
      };
      try {
        return {
          url: await generateStudioVideo("test", "mug", null, controller.signal, { model }),
          calls,
          submits,
          polls,
        };
      } catch (error) {
        return { error: error.message, name: error.name, calls, submits, polls };
      }
    };
    return {
      vertex: await run("google/veo-3.1-generate-001"),
      native: await run("minimax/minimax-h3-max"),
      omni: await run("google/gemini-omni-1.1-flash-preview"),
      terminal: await run("google/veo-3.1-generate-001", "404"),
      transient: await run("minimax/minimax-h3-max", "transient"),
      cancelled: await run("google/veo-3.1-generate-001", "cancel"),
    };
  });
  assert.equal(results.vertex.url, "https://example.com/result.mp4");
  assert.equal(results.native.url, "https://example.com/result.mp4");
  assert.equal(results.native.calls[1].method, "GET");
  assert.equal(results.omni.url, "data:video/mp4;base64,AQ==");
  assert.equal(results.omni.calls.length, 1);
  assert.equal(results.omni.calls[0].body.response_format.duration, "3s");
  assert.match(results.terminal.error, /404.*google\/veo/);
  assert.equal(results.terminal.polls, 1);
  assert.equal(results.transient.submits, 1);
  assert.equal(results.transient.polls, 2);
  assert.ok(results.transient.url);
  assert.equal(results.cancelled.name, "AbortError");
  assert.equal(results.cancelled.polls, 0);
  await page.evaluate(async () => {
    const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
    const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
    const { PlatformProvider } = await import("/packages/ui/src/hooks/usePlatform.tsx");
    const { StudioPanel } = await import("/packages/ui/src/v4/composer/studio/StudioPanel.tsx");
    document.body.innerHTML = '<div id="app"></div>';
    createRoot(document.getElementById("app")).render(
      React.createElement(
        ZCodeIntlProvider,
        { initialLocale: "en-US" },
        React.createElement(
          PlatformProvider,
          { platform: {} },
          React.createElement(StudioPanel, { modelSelectionView: null }),
        ),
      ),
    );
  });
  await page.getByRole("button", { name: "Video", exact: true }).click();
  const duration = page.getByLabel("Duration (sec)", { exact: true });
  await duration.waitFor({ state: "visible" });
  assert.deepEqual(
    await duration.locator("option").evaluateAll((nodes) => nodes.map((n) => n.value)),
    ["4", "6", "8"],
  );
  await duration.selectOption("6");
  await page.evaluate(() => window.setVideoModel("google/gemini-omni-1.1-flash-preview"));
  await page.waitForFunction(() => document.querySelector('option[value="10"]'));
  assert.deepEqual(
    await duration.locator("option").evaluateAll((nodes) => nodes.map((n) => n.value)),
    ["3", "4", "5", "6", "7", "8", "9", "10"],
  );
  await duration.selectOption("10");
  await page.evaluate(() => window.setVideoModel("google/veo-3.1-generate-001"));
  await page.waitForFunction(() => !document.querySelector('option[value="10"]'));
  assert.equal(await duration.inputValue(), "4");
  await page.evaluate(() => window.setVideoModel("alibaba/wan3.0-video"));
  await page.waitForFunction(() => document.querySelector('option[value="30"]'));
  assert.equal(await duration.locator("option").count(), 29);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await duration.isVisible(), true);
  console.log(
    "PASS: actual StudioPanel model duration options change, invalid old selections reset, and controls remain visible on mobile.",
  );
  console.log(
    "PASS: real mediaClient routes three protocols, retains duration, terminates 404, retries polling without resubmit, and cancels.",
  );
} finally {
  await browser.close();
  await server.close();
}
