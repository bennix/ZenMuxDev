import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import JSZip from "jszip";
import { exportVisualPptx } from "../../../apps/zcode-cli/packages/bundled-skills/skills/officecli/scripts/compatibility.mjs";

const root = resolve(import.meta.dirname, "../../..");
const bundle = await build({
  stdin: {
    contents: `
    export {measureDeckPages, buildEditableDeckPptx} from './packages/ui/src/v4/composer/studio/htmlToEditablePptx.ts';
    export {buildVisualDeckPptx, renderVisualDeckImages} from './packages/ui/src/v4/composer/studio/deckVisualPptx.ts';
    export {renderDeckPdf} from './packages/ui/src/v4/composer/studio/deckPdfExport.ts';
  `,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "exports",
  alias: { "@": join(root, "packages/ui/src") },
  plugins: [
    {
      name: "worker-url",
      setup(build) {
        build.onResolve({ filter: /pdfium\.wasm\?url$/ }, () => ({
          path: "worker",
          namespace: "worker",
        }));
        build.onLoad({ filter: /.*/, namespace: "worker" }, () => ({
          contents: 'export default "/pdfium.wasm"',
        }));
      },
    },
  ],
});
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") console.error(message.text());
  });
  const worker = await readFile(join(root, "node_modules/@embedpdf/pdfium/dist/pdfium.wasm"));
  await page.route("http://localhost/**", (route) =>
    route.fulfill({
      contentType: route.request().url().endsWith("pdfium.wasm") ? "application/wasm" : "text/html",
      body: route.request().url().endsWith("pdfium.wasm") ? worker : "<body></body>",
    }),
  );
  await page.goto("http://localhost/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const html = `<html><body style="margin:0"><section data-pptx-slide style="width:1280px;height:720px;position:relative;background:#f0eada">
    <div style="position:absolute;left:800px;top:120px;width:200px;height:100px;background:conic-gradient(black,white,black)"></div>
    <p style="position:absolute;left:100px;top:120px;width:400px;height:100px;box-sizing:border-box;padding:20px 30px;border:2px solid black;margin:0;font:24px Arial;background:#ccc">Padded text</p>
    <div style="position:absolute;left:100px;top:400px;width:300px;height:80px;background:#aabbcc"></div>
    <p style="position:absolute;left:110px;top:410px;width:280px;height:60px;margin:0;font:24px Arial">Bottom neighbour</p>
  </section></body></html>`;
  const measured = await page.evaluate((html) => exports.measureDeckPages([html]), html);
  const text = measured[0].nodes.find((node) => node.text === "Padded text");
  assert.ok(text);
  assert.equal(text.x, 132);
  assert.equal(text.y, 142);
  assert.equal(text.w, 336);
  assert.equal(text.h, 56);
  // The writer must ignore legacy fit hints rather than relocate other elements.
  const bytes = await page.evaluate(async (measured) => {
    measured[0].nodes.find((node) => node.text === "Padded text").widenPx = 150;
    return Array.from(await exports.buildEditableDeckPptx(measured));
  }, measured);
  const editable = await JSZip.loadAsync(new Uint8Array(bytes));
  const xml = await editable.file("ppt/slides/slide1.xml").async("string");
  assert.ok(xml.includes('x="1257269" y="1352550"'), "text origin preserves browser content box");
  assert.ok(xml.includes('cx="3200320" cy="533400"'), "text size is not widened");
  await page.evaluate(async (html) => {
    window.host = await exports.renderDeckPdf([html, html.replace("#f0eada", "#aaccff")], document);
  }, html);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.evaluate(() => window.host.dispose());
  async function convert(buffer) {
    return page.evaluate(
      async (bytes) => Array.from(await exports.buildVisualDeckPptx(new Uint8Array(bytes).buffer)),
      [...buffer],
    );
  }
  const images = await page.evaluate(
    async (bytes) => exports.renderVisualDeckImages(new Uint8Array(bytes).buffer),
    [...pdf],
  );
  const officePath = "/tmp/zencode-officecli-pdf-fidelity.pptx";
  const report = await exportVisualPptx(images, officePath);
  assert.equal(report.pages, 2);
  assert.equal(report.validation.success, true);
  const office = await JSZip.loadAsync(await readFile(officePath));
  assert.equal(
    Object.keys(office.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).length,
    2,
  );
  const media = Object.values(office.files).filter(
    (file) => /^ppt\/media\//.test(file.name) && !file.dir,
  );
  assert.equal(media.length, 2);
  const embedded = await Promise.all(media.map((file) => file.async("nodebuffer")));
  for (const image of images)
    assert.ok(
      embedded.some((bytes) => bytes.equals(Buffer.from(image.split(",")[1], "base64"))),
      "OfficeCLI must preserve exact PDF raster bytes",
    );
  const visual = await JSZip.loadAsync(new Uint8Array(await convert(pdf)));
  assert.equal(
    Object.keys(visual.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).length,
    2,
  );
  for (let i = 1; i <= 2; i++) {
    const slide = await visual.file(`ppt/slides/slide${i}.xml`).async("string");
    assert.equal((slide.match(/<p:pic>/g) || []).length, 1);
    assert.ok(!slide.includes("<p:sp>"), "visual slides must not contain reflowable text");
  }
  const firstImage = Object.values(visual.files).find((file) =>
    /ppt\/media\/.*\.png$/.test(file.name),
  );
  assert.ok(firstImage);
  const pink = await page.evaluate(
    async (data) => {
      const img = new Image();
      img.src = "data:image/png;base64," + data;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (
          pixels[i] > 240 &&
          pixels[i + 1] > 50 &&
          pixels[i + 1] < 150 &&
          pixels[i + 2] > 100 &&
          pixels[i + 2] < 220
        )
          count++;
      return count;
    },
    await firstImage.async("base64"),
  );
  assert.equal(pink, 0, "Type 1 shading must not become a pink placeholder");
  if (process.argv[2] && process.argv[3]) {
    await writeFile(
      process.argv[3],
      new Uint8Array(await convert(await readFile(process.argv[2]))),
    );
    console.log(`Created ${process.argv[3]}`);
  }
  console.log("PASS: padded geometry, no export reflow, all-page visual PPT conversion");
} finally {
  await browser.close();
}
