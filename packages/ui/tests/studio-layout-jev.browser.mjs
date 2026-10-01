import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  esbuild: { jsx: "automatic" },
  server: { port: 5198 },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5198");
  const result = await page.evaluate(async () => {
    const { repairStudioSlide } =
      await import("/packages/ui/src/v4/composer/studio/studioSlideLayout.ts");
    const { useStudioRepairModelStore } =
      await import("/packages/ui/src/store/studioRepairModelStore.ts");
    const html =
      '<html><body data-pptx-slide style="margin:0;width:1280px;height:720px"><h1 data-pptx-id="title" data-pptx-kind="text" style="position:absolute;left:48px;top:48px;width:1000px;height:100px;margin:0;font-size:48px">布局测试 Layout</h1></body></html>';
    const calls = [],
      outputs = [];
    let failure = false;
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url: String(url), body });
      if (String(url).endsWith("/systemone")) {
        if (failure) throw new Error("offline");
        return Response.json({ layout_quality: 0.8 });
      }
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: html }, finish_reason: "stop" }] })}\n\n`,
      );
    };
    const input = {
      html,
      apiKey: "test",
      model: "repair-test",
      force: true,
      signal: new AbortController().signal,
      onOutput: (text) => outputs.push(text),
      onRepair: () => {},
    };
    await repairStudioSlide(input);
    const firstCalls = calls.splice(0);
    useStudioRepairModelStore.getState().setEvaluatorModelId("");
    await repairStudioSlide(input);
    const disabledCalls = calls.splice(0);
    useStudioRepairModelStore.getState().setEvaluatorModelId("typesafe/jev-1.13");
    failure = true;
    await repairStudioSlide(input);
    const failedCalls = calls.splice(0);
    const controller = new AbortController();
    globalThis.fetch = async (url, options) => {
      calls.push(String(url));
      controller.abort();
      options.signal.throwIfAborted();
    };
    let cancelled = false;
    try {
      await repairStudioSlide({ ...input, signal: controller.signal });
    } catch {
      cancelled = controller.signal.aborted;
    }
    return {
      firstCalls,
      disabledCalls,
      failedCalls,
      outputs,
      cancelled,
      cancelCalls: calls.length,
    };
  });
  assert.equal(result.firstCalls.length, 2);
  assert.equal(result.firstCalls[0].body.model, "typesafe/jev-1.13");
  assert.ok(result.firstCalls[0].url.endsWith("/systemone"));
  assert.equal(result.firstCalls[1].body.model, "repair-test");
  assert.deepEqual(JSON.parse(result.firstCalls[1].body.messages[1].content).evaluation, {
    layout_quality: 0.8,
  });
  assert.equal(result.disabledCalls.length, 1);
  assert.equal(result.failedCalls.length, 2);
  assert.ok(result.outputs.includes("版面评估暂不可用，继续本地检查和修复。"));
  assert.equal(result.cancelled, true);
  assert.equal(result.cancelCalls, 1);
  console.log(
    "PASS: JEV endpoint, repair advice, disabled evaluation, failure fallback and cancellation",
  );
} finally {
  await browser.close();
  await server.close();
}
