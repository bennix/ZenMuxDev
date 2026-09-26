import { verifyStudioPanel } from "./studio-panel.browser-scenarios.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const server = await createServer({
  configFile: false,
  esbuild: { jsx: "automatic" },
  root: process.cwd(),
  server: { port: 5198 },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5198");
  const result = await page.evaluate(async () => {
    const { generateStudioDeck } =
      await import("/packages/ui/src/v4/composer/studio/studioPptGenerate.ts");
    const { prepareDeckHtml, measureDeckPages, replaceDeckElements, buildEditableDeckPptx } =
      await import("/packages/ui/src/v4/composer/studio/htmlToEditablePptx.ts");
    const html = (n) =>
      `<!doctype html><html><head><style>.title{position:absolute;left:${n * 10}px;top:40px;font-size:32px;color:rgb(${n},0,0)}</style></head><body style="margin:0;width:1280px;height:720px"><h1 class="title" data-pptx-kind="text" data-pptx-id="title">Page ${n}</h1><div data-pptx-kind="shape" style="position:absolute;left:400px;top:200px;width:100px;height:100px;background:red"></div><svg data-pptx-kind="image" style="position:absolute;left:600px;top:200px" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg></body></html>`;
    let requests = 0;
    const requestedPages = [];
    let failedSixth = false;
    const completed = [];
    const output = [];
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (!request.stream) throw new Error("Expected streaming request");
      const pageNumber = Number(request.messages[1].content.match(/^Slide (\d+) of/u)?.[1] ?? 0);
      if (pageNumber) requestedPages.push(pageNumber);
      if (pageNumber === 6 && !failedSixth) {
        failedSixth = true;
        return new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "<html>partial" } }] })}\n\n`,
        );
      }
      const reply =
        requests++ === 0
          ? "Background: #ffffff"
          : requests === 2
            ? JSON.stringify({
                pages: Array.from({ length: 20 }, (_, i) => ({
                  title: `Page ${i + 1}`,
                  brief: "Facts",
                  type: "content",
                  layout: "two_column_comparison",
                })),
              })
            : html(pageNumber);
      const frames = [reply.slice(0, 12), reply.slice(12)]
        .map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
        .join("");
      return new Response(frames + "data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      });
    };
    const pages = await generateStudioDeck({
      apiKey: "test",
      model: "test",
      brief: "20 slides",
      styleHint: "simple",
      pageCount: 20,
      signal: new AbortController().signal,
      onPage: (pages) => completed.push(pages.length),
      onProgress: () => {},
      onOutput: (text) => output.push(text),
    });
    const measured = await measureDeckPages(pages);
    const bytes = await buildEditableDeckPptx(measured);
    const doc = new DOMParser().parseFromString(
      prepareDeckHtml(
        '<html><body><p data-pptx-id="x">One</p><p data-pptx-id="x">Two</p></body></html>',
      ),
      "text/html",
    );
    const ids = [...doc.querySelectorAll("[data-pptx-id]")].map((el) =>
      el.getAttribute("data-pptx-id"),
    );
    const edited = replaceDeckElements(pages[0], [{ id: "title", html: "<h1>Changed</h1>" }]);
    return {
      requestedPages,
      bytes: Array.from(bytes),
      count: pages.length,
      completed,
      streamed: output.length,
      measured: measured.length,
      kinds: measured[0].nodes.map((node) => node.kind),
      positions: measured.map((p) => p.nodes.find((n) => n.kind === "text")?.x),
      unique: new Set(ids).size === ids.length,
      edited: edited.includes("Changed"),
      untouched: pages[1].includes("Page 2"),
    };
  });
  const JSZip = createRequire(require.resolve("pptxgenjs"))("jszip");
  const zip = await JSZip.loadAsync(Uint8Array.from(result.bytes));
  assert.equal(
    Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).length,
    20,
  );
  assert.match(await zip.file("ppt/slides/slide20.xml").async("string"), /Page 20/);
  assert.equal(result.count, 20);
  assert.equal(result.requestedPages.filter((page) => page === 6).length, 2);
  assert.equal(result.requestedPages.length, 21);
  assert.deepEqual(
    result.completed,
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  assert.ok(result.streamed > 20);
  assert.equal(result.measured, 20);
  assert.ok(["text", "shape", "image"].every((kind) => result.kinds.includes(kind)));
  assert.ok(result.positions[19] > result.positions[0]);
  assert.ok(result.unique);
  assert.ok(result.edited && result.untouched);
  const repaired = await page.evaluate(async () => {
    const { generateStudioDeck } =
      await import("/packages/ui/src/v4/composer/studio/studioPptGenerate.ts");
    let plans = 0;
    const requests = [];
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      const system = request.messages[0].content;
      let content;
      if (system.includes("deck planner")) {
        requests.push(request);
        plans++;
        const pages = Array.from({ length: plans === 1 ? 9 : 10 }, (_, i) => ({
          title: `Page ${i}`,
          brief: "Facts",
        }));
        if (plans === 2) delete pages[3].brief;
        content = JSON.stringify({ core_hook: "test", pages });
      } else if (system.includes("visual designer")) content = "Plain style";
      else content = "<html><body><p>Slide</p></body></html>";
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
      );
    };
    const pages = await generateStudioDeck({
      apiKey: "test",
      model: "test",
      brief: "Original subject",
      discussion: "Return one HTML file at 1600x900",
      styleHint: "plain",
      pageCount: 10,
      signal: new AbortController().signal,
      onPage: () => {},
      onProgress: () => {},
    });
    return { count: pages.length, plans, requests };
  });
  assert.equal(repaired.count, 10);
  assert.equal(repaired.plans, 3);
  assert.equal(repaired.requests[1].messages[2].role, "assistant");
  assert.match(repaired.requests[1].messages[3].content, /需要 10 页，实际返回 9 页/);
  assert.match(repaired.requests[2].messages[3].content, /第 4 页.*brief/);
  assert.ok(repaired.requests.every((request) => request.max_tokens >= 8192));
  assert.equal(
    JSON.parse(repaired.requests[0].messages[1].content).sourceMaterial,
    "Original subject",
  );
  console.log(
    "PASS: short outline and missing brief repaired with exact prior response and validation feedback",
  );
  const failure = await page.evaluate(async () => {
    const { generateStudioDeck } =
      await import("/packages/ui/src/v4/composer/studio/studioPptGenerate.ts");
    let calls = 0;
    let landed = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls >= 8) return new Response("page failed", { status: 500 });
      const content =
        calls === 1
          ? "Style"
          : calls === 2
            ? JSON.stringify({
                pages: Array.from({ length: 20 }, (_, i) => ({
                  title: `Page ${i}`,
                  brief: "Facts",
                })),
              })
            : "<html><body><p>Complete page</p></body></html>";
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
      );
    };
    let failed = false;
    try {
      await generateStudioDeck({
        apiKey: "test",
        model: "test",
        brief: "20 pages",
        styleHint: "plain",
        pageCount: 20,
        signal: new AbortController().signal,
        onPage: (pages) => {
          landed = pages.length;
        },
        onProgress: () => {},
      });
    } catch {
      failed = true;
    }
    const controller = new AbortController();
    controller.abort();
    const before = calls;
    let cancelled = false;
    try {
      await generateStudioDeck({
        apiKey: "test",
        model: "test",
        brief: "20 pages",
        styleHint: "plain",
        pageCount: 20,
        signal: controller.signal,
        onPage: () => {},
        onProgress: () => {},
      });
    } catch {
      cancelled = true;
    }
    return { failed, landed, cancelled, noRequest: calls === before };
  });
  assert.deepEqual(failure, { failed: true, landed: 5, cancelled: true, noRequest: true });
  await page.evaluate(async () => {
    const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
    const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
    const { SlideDeckView } = await import("/packages/ui/src/v4/composer/studio/SlideDeckView.tsx");
    const { applyDeckGeometry } =
      await import("/packages/ui/src/v4/composer/studio/useSlideGeometry.ts");
    const pages = Array.from(
      { length: 20 },
      (_, i) =>
        `<html><head><style>.title{position:absolute;left:${40 + i * 5}px;top:40px;margin:0;width:300px;height:60px;font-size:32px}</style></head><body data-pptx-slide style="margin:0;width:1280px;height:720px"><h1 class="title" data-pptx-kind="text" data-pptx-id="title">Slide ${i + 1}</h1><p data-pptx-id="body" data-pptx-kind="text" style="position:absolute;left:400px;top:40px;margin:0;width:200px;height:60px">Body</p><div data-pptx-id="parent" data-pptx-kind="shape" style="position:absolute;left:800px;top:300px;width:60px;height:60px"><span data-pptx-id="tiny" data-pptx-kind="text" style="font-size:8px">Tiny</span></div></body></html>`,
    );
    function Harness() {
      const [current, setPage] = React.useState(0);
      const [documents, setDocs] = React.useState(pages);
      const [ids, setIds] = React.useState([]);
      return React.createElement(
        ZCodeIntlProvider,
        { initialLocale: "en-US" },
        React.createElement(SlideDeckView, {
          html: documents[current],
          onGeometryChange: (source, edits) =>
            setDocs((pages) =>
              pages.map((html, index) =>
                index === current && html === source ? applyDeckGeometry(html, edits) : html,
              ),
            ),
          page: current,
          total: 20,
          onPageChange: setPage,
          selectedIds: ids,
          setSelectedIds: setIds,
        }),
        React.createElement("output", { id: "picked" }, ids.join(",")),
      );
    }
    document.body.innerHTML =
      '<style>.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.top-0{top:0}.left-0{left:0}.w-full{width:100%}.z-20{z-index:20}.z-30{z-index:30}.pointer-events-none{pointer-events:none}</style><div id="app" style="width:640px"></div>';
    createRoot(document.getElementById("app")).render(React.createElement(Harness));
  });
  await page.getByRole("checkbox").check();
  await page.locator("iframe").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector("iframe")?.contentDocument?.querySelector("h1")?.textContent ===
      "Slide 1",
  );
  const frame = page.frames().find((frame) => frame !== page.mainFrame());
  assert.equal(await frame.locator("h1").evaluate((el) => el.getBoundingClientRect().left), 40);
  // Use the preview's real pointer overlay, including the half-size coordinate transform.
  const overlay = page.getByTestId("ppt-selection-overlay");
  await overlay.click({ position: { x: 40, y: 30 } });
  await page.waitForFunction(() => document.querySelector("#picked")?.textContent === "title");
  assert.equal(await page.getByTestId("ppt-element-title").getAttribute("aria-pressed"),"true");
  assert.ok(await page.getByTestId("ppt-resize-nw").isVisible());
  assert.ok(await page.getByTestId("ppt-selection-bounds").isVisible());
  await overlay.click({ position: { x: 220, y: 30 }, modifiers: ["Shift"] });
  await page.waitForFunction(() => document.querySelector("#picked")?.textContent === "title,body");
  let groupCanvas = await overlay.boundingBox();
  await page.mouse.move(groupCanvas.x + 40, groupCanvas.y + 30);
  await page.mouse.down();
  await page.mouse.move(groupCanvas.x + 60, groupCanvas.y + 40, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      document
        .querySelector("iframe")
        ?.contentDocument?.querySelector("h1")
        ?.getBoundingClientRect().x === 80,
  );
  assert.equal(await frame.locator("p").evaluate((el) => el.getBoundingClientRect().x), 440);
  const handle = await page.getByTestId("ppt-resize-se").boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 28, handle.y + handle.height / 2 + 4, {
    steps: 4,
  });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      Math.abs(
        document
          .querySelector("iframe")
          ?.contentDocument?.querySelector("h1")
          ?.getBoundingClientRect().width - 330,
      ) < 1,
  );
  assert.ok(
    Math.abs((await frame.locator("p").evaluate((el) => el.getBoundingClientRect().width)) - 220) <
      1,
  );
  assert.equal(await page.getByTestId("ppt-element-title").isVisible(),true);
  await page.getByTestId("ppt-element-tiny").click();
  assert.equal(await page.locator("#picked").textContent(), "tiny");
  await page.getByTestId("ppt-element-parent").click();
  assert.equal(await page.locator("#picked").textContent(), "parent");
  assert.equal(await page.getByTestId("ppt-element-parent").getAttribute("aria-pressed"),"true");
  assert.ok(await frame.locator('[data-pptx-id="parent"]').evaluate(el=>el.hasAttribute("data-pptx-picked")));
  for (const corner of ["nw", "ne", "se", "sw"]) {
    assert.ok(await page.getByTestId(`ppt-resize-${corner}`).isVisible());
    const box = await page.getByTestId(`ppt-resize-${corner}`).boundingBox();
    assert.ok(box.width >= 20 && box.height >= 20);
  }
  const moveGrip = page.getByTestId("ppt-move-selection");
  await moveGrip.scrollIntoViewIfNeeded();
  const grip = await moveGrip.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 20, grip.y + grip.height / 2 + 10, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      Math.abs(
        document
          .querySelector("iframe")
          ?.contentDocument?.querySelector('[data-pptx-id="parent"]')
          ?.getBoundingClientRect().x - 840,
      ) < 1,
  );
  assert.equal(await page.locator("#picked").textContent(), "parent");
  console.log(
    "PASS: list-selected nested parent keeps identity through move grip, four visible corner handles",
  );

  console.log("PASS: group move/resize and deep tiny element/parent selection");
  for (let i = 1; i < 20; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("iframe")?.contentDocument?.querySelector("h1")?.textContent ===
      "Slide 20",
  );
  assert.equal(await page.locator("#picked").textContent(), "");
  assert.equal(await frame.locator("h1").evaluate((el) => el.getBoundingClientRect().left), 135);
  console.log(
    "PASS: browser selection, Shift multi-select, page 20 navigation, isolated CSS, selection reset",
  );
  await verifyStudioPanel(page);
} finally {
  await browser.close();
  await server.close();
}
