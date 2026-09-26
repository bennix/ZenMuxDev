import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  esbuild: { jsx: "automatic" },
  server: { port: 5199 },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5199");
  const result = await page.evaluate(async () => {
    const { auditSlideLayout, ensureSlideLayout } =
      await import("/packages/ui/src/v4/composer/studio/studioSlideLayout.ts");
    const { applyDeckTheme, deckThemeForStyle } =
      await import("/packages/ui/src/v4/composer/studio/deckTheme.ts");
    const { measureDeckPages } =
      await import("/packages/ui/src/v4/composer/studio/htmlToEditablePptx.ts");
    const document = (secondY, code) =>
      `<html><body data-pptx-slide style="margin:0;width:1280px;height:720px;background:purple"><h1 data-pptx-id="title" data-pptx-kind="text" style="position:absolute;left:48px;top:40px;width:1000px;height:80px;margin:0;font-size:48px;font-family:monospace">Python 条件判断</h1><div data-pptx-kind="shape" data-pptx-role="card" style="position:absolute;left:32px;top:164px;width:560px;height:112px;background:white"></div><p data-pptx-id="a" data-pptx-kind="text" style="position:absolute;left:48px;top:180px;width:500px;height:60px;margin:0;font-size:28px">先把中文规则翻译为条件</p><p data-pptx-id="b" data-pptx-kind="text" style="position:absolute;left:48px;top:${secondY}px;width:500px;height:60px;margin:0;font-size:28px">再验证输入边界</p>${code ? '<pre data-pptx-id="code" data-pptx-kind="text" style="position:absolute;left:950px;top:680px;width:300px;height:40px;font-size:28px">temperature = float(input("long overflowing example"))</pre>' : ""}</body></html>`;
    const bad = document(180, true),
      good = document(320, false);
    const signal = new AbortController().signal;
    const issues = await auditSlideLayout(bad, signal);
    const valid = await auditSlideLayout(good, signal);
    const resourceIssues=await auditSlideLayout(good.replace('</body>','<img data-pptx-id="missing" src="{{ILLUSTRATION}}" style="position:absolute;left:800px;top:180px;width:200px;height:200px"></body>'),signal);
    const exportIssues = await auditSlideLayout('<html><body data-pptx-slide style="margin:0;width:1280px;height:720px">Export-only missing text</body></html>',signal);
    let repairs = 0;
    const progress = [];
    const fixed = await ensureSlideLayout({
      html: bad,
      signal,
      theme: deckThemeForStyle("杂志风"),
      onLayoutProgress: (event) => progress.push(event),
      repair: async () => {
        repairs++;
        return repairs < 4 ? bad : good;
      },
    });
    let failed = false,
      failCalls = 0;
    const cancellation = new AbortController();
    try {
      await ensureSlideLayout({
        html: bad,
        signal: cancellation.signal,
        repair: async () => {
          failCalls++;
          if (failCalls === 5) cancellation.abort();
          return bad;
        },
      });
    } catch {
      failed = true;
    }
    const formatEvents = [],
      bases = [],
      rejected = [];
    let formatCalls = 0;
    const recovered = await ensureSlideLayout({
      html: "<!doctype html><html><head><style>",
      signal,
      onLayoutProgress: (e) => formatEvents.push(e),
      repair: async (base, issues, attempt, raw) => {
        bases.push(base);
        rejected.push(raw);
        formatCalls++;
        return attempt === 1 ? bad : attempt === 2 ? "<html><body>truncated" : good;
      },
    });
    if (!recovered.includes("再验证输入边界")) throw new Error("Missing recovered content");
    let cappedCalls = 0;
    const cappedEvents = [];
    const retained = await ensureSlideLayout({
      html: bad,
      signal,
      onLayoutProgress: (e) => cappedEvents.push(e),
      repair: async () => {
        cappedCalls++;
        return bad;
      },
    });
    const retainedWarning = new DOMParser().parseFromString(retained, "text/html").body.dataset
      .studioLayoutWarning;
    const { generateStudioDeck } =
      await import("/packages/ui/src/v4/composer/studio/studioPptGenerate.ts");
    let generationRepairs = 0;
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body),
        system = request.messages[0].content;
      let content = good;
      if (system.includes("visual designer")) content = "Simple style";
      else if (system.includes("deck planner"))
        content = JSON.stringify({
          pages: [
            { title: "One", brief: "One" },
            { title: "Two", brief: "Two" },
          ],
        });
      else if (system.includes("Repair the layout")) {
        if(request.model !== "repair-test") throw new Error("Wrong repair model");
        generationRepairs++;
        content = bad;
      } else if (request.messages[1].content.startsWith("Slide 1 of")) content = bad;
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }] })}\n\n`,
      );
    };
    const generated = await generateStudioDeck({
      apiKey: "test",
      model: "test",
      repairModel: "repair-test",
      brief: "Two slides",
      styleHint: "瑞士风",
      pageCount: 2,
      signal,
      onPage: () => {},
      onProgress: () => {},
    });
    const magazine = await measureDeckPages([fixed]);
    const swissHtml = applyDeckTheme(fixed, deckThemeForStyle("瑞士风"));
    const swiss = await measureDeckPages([swissHtml]);
    const doc = new DOMParser().parseFromString(swissHtml, "text/html");
    return {
      cappedCalls,
      cappedEvents,
      retainedWarning,
      generationRepairs,
      generatedCount: generated.length,
      formatCalls,
      formatEvents,
      bases,
      rejected,
      exportIssues,resourceIssues,
      kinds: issues.map((i) => i.kind),
      valid,
      repairs,
      progress,
      failed,
      failCalls,
      magazine: magazine[0].background,
      swiss: swiss[0].background,
      font: doc.querySelector("h1").style.fontFamily,
      theme: doc.body.dataset.studioTheme,
    };
  });
  assert.ok(result.kinds.includes("overlap") && result.kinds.includes("overflow"));
  assert.deepEqual(result.valid, []);
  assert.ok(result.resourceIssues.some(issue=>issue.kind === "resource"));
  assert.ok(result.exportIssues.some(issue=>issue.kind === "export"));
  assert.equal(result.cappedCalls, 5);
  assert.equal(result.cappedEvents.at(-1).stage, "retained");
  assert.ok(result.retainedWarning);
  assert.equal(result.generationRepairs, 5);
  assert.equal(result.generatedCount, 2);
  assert.equal(result.formatCalls, 3);
  assert.ok(result.formatEvents.some((e) => e.issues.some((i) => i.kind === "format")));
  assert.ok(result.bases[2].includes("先把中文规则翻译为条件"));
  assert.equal(result.rejected[2], "<html><body>truncated");
  assert.equal(result.repairs, 4);
  assert.deepEqual(
    result.progress.filter((p) => p.stage === "repairing").map((p) => p.attempt),
    [1, 2, 3, 4],
  );
  assert.ok(
    result.progress.filter((p) => p.stage === "repairing").every((p) => p.issues.length > 0),
  );
  assert.equal(result.progress.at(-1).stage, "passed");
  assert.equal(result.failed, true);
  assert.equal(result.failCalls, 5);
  assert.equal(result.magazine, "F5F1E8");
  assert.equal(result.swiss, "FFFFFF");
  assert.equal(result.theme, "swiss");
  assert.match(result.font, /Arial/);
  console.log(
    "PASS: overlap/overflow detection, card containment, continuous repair, progress and cancellation, theme enforcement and export theme parity",
  );
} finally {
  await browser.close();
  await server.close();
}
