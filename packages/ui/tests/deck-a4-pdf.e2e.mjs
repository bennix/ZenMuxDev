import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const root = resolve(import.meta.dirname, "../../..");
const out = await mkdtemp(join(tmpdir(), "zcode-a4-"));
const bundle = await build({
  stdin: {
    contents:
      'export {renderDeckPdf} from "./packages/ui/src/v4/composer/studio/deckPdfExport.ts";',
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "deckExport",
  alias: { "@": join(root, "packages/ui/src") },
});
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent("<body><main>APP CHROME MUST NOT PRINT</main></body>");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const pages = ["FIRST", "SECOND", "THIRD"].map(
      (label, i) =>
        `<html><head><style>body{margin:0;font-family:Arial}section{width:1280px;height:720px;background:${i === 1 ? "#ffeecc" : "#ddeeff"};position:relative}h1{position:absolute;left:60px;top:60px;font-size:48px}</style></head><body><section data-pptx-slide hidden><h1>${label} PAGE 中文内容</h1></section></body></html>`,
    );
    window.printHost = await deckExport.renderDeckPdf(pages, document);
    return [...document.querySelectorAll("[data-zcode-pptx-print-slide]")].map((el) => ({
      width: el.offsetWidth,
      height: el.offsetHeight,
      transform: getComputedStyle(el).transform,
      frames: el.querySelectorAll("iframe").length,
    }));
  });
  assert.equal(result.length, 3);
  for (const x of result) {
    assert.equal(x.width, 1280);
    assert.equal(x.height, 720);
    assert.equal(x.frames, 1);
    assert.match(x.transform, /matrix\(/);
  }
  const pdfPath = join(out, "all-slides-a4.pdf");
  await page.pdf({
    path: pdfPath,
    preferCSSPageSize: true,
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const pdf = await getDocument({
    data: new Uint8Array(await readFile(pdfPath)),
    useSystemFonts: true,
  }).promise;
  assert.equal(pdf.numPages, 3);
  for (let i = 1; i <= 3; i++) {
    const p = await pdf.getPage(i);
    const v = p.getViewport({ scale: 1 });
    assert.ok(Math.abs(v.width - 841.89) < 2);
    assert.ok(Math.abs(v.height - 595.28) < 2);
    const text = (await p.getTextContent()).items.map((x) => x.str).join(" ");
    assert.ok(text.includes(["FIRST", "SECOND", "THIRD"][i - 1]), text);
    assert.ok(!text.includes("APP CHROME"), text);
    assert.ok(text.normalize("NFKC").replace(/\s/g, "").includes("中文"), text);
  }
  await page.evaluate(() => window.printHost.dispose());
  assert.equal(
    await page.locator("[data-zcode-pptx-print-host], [data-zcode-pptx-print-style]").count(),
    0,
  );
  console.log(
    "PASS: all 3 slides, order, A4 landscape, intrinsic geometry, Chinese text, cleanup. PDF:",
    pdfPath,
  );
} finally {
  await browser.close();
}
