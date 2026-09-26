import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const JSZip = require("jszip");
const docx = new JSZip();
docx.file(
  "[Content_Types].xml",
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
);
docx.file(
  "_rels/.rels",
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
);
docx.file(
  "word/document.xml",
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${Array.from({ length: 20 }, (_, i) => `<w:p><w:r><w:t>Fixture page ${i + 1}</w:t></w:r>${i < 19 ? '<w:r><w:br w:type="page"/></w:r>' : ""}</w:p>`).join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
);
const fixture = await docx.generateAsync({ type: "nodebuffer" });
const { default: tailwindcss } = await import(
  require.resolve("@tailwindcss/vite", { paths: ["packages/desktop"] })
);
const server = await createServer({
  plugins: [
    tailwindcss(),
    {
      name: "office-fixture",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === "/fixture.docx") {
            response.end(fixture);
            return;
          }
          if (request.url === "/") {
            response.setHeader("Content-Type", "text/html");
            response.end("<!doctype html><html><body></body></html>");
            return;
          }
          next();
        });
      },
    },
  ],
  configFile: false,
  root: process.cwd(),
  server: { port: 0 },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => console.error(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  const result = await page.evaluate(async () => {
    const { showOfficePreviewPage } = await import("/packages/ui/src/lib/officePageNavigation.ts");
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const pages = Array.from({ length: 20 }, (_, index) => {
      const section = document.createElement("section");
      section.textContent = `Page ${index + 1}`;
      root.append(section);
      return section;
    });
    const visible = () =>
      pages
        .filter((page) => page.getBoundingClientRect().height > 0)
        .map((page) => page.textContent);
    showOfficePreviewPage(pages, 0);
    const first = visible();
    showOfficePreviewPage(pages, 19);
    const last = visible();
    const clamped = showOfficePreviewPage(pages, 100);
    const reset = showOfficePreviewPage(pages, -1);
    return { first, last, clamped, reset, retained: root.children.length };
  });
  assert.deepEqual(result, {
    first: ["Page 1"],
    last: ["Page 20"],
    clamped: 19,
    reset: 0,
    retained: 20,
  });
  await page.evaluate(async () => {
    await import("/packages/ui/src/styles.css");
    const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
    const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
    const { PreviewPaneOfficeDocxContent } =
      await import("/packages/ui/src/previewPaneOfficeDocxContent.tsx");
    const buffer = await (await fetch("/fixture.docx")).arrayBuffer();
    document.body.innerHTML = '<div id="app" style="width:900px;height:800px"></div>';
    const root = createRoot(document.getElementById("app"));
    window.renderFixture = (sourcePath) =>
      root.render(
        React.createElement(
          ZCodeIntlProvider,
          { initialLocale: "en-US" },
          React.createElement(PreviewPaneOfficeDocxContent, {
            buffer,
            sourcePath,
            errorMessage: "Parse failed",
          }),
        ),
      );
    window.renderFixture("twenty-pages.docx");
  });
  const navigation = page.locator("[data-docx-page-navigation]");
  await navigation.waitFor();
  assert.match(await navigation.innerText(), /1 \/ 20/);
  const controls = navigation.getByRole("button");
  assert.equal(await controls.nth(0).isEnabled(), false);
  for (let number = 2; number <= 20; number++) {
    await controls.nth(1).click();
    await page.waitForFunction(
      (n) =>
        document.querySelector("[data-docx-page-navigation]").textContent.includes(`${n} / 20`),
      number,
    );
    assert.equal(
      await page.locator('[data-docx-render-body] section[aria-hidden="false"]').count(),
      1,
    );
    assert.match(
      await page.locator('section[aria-hidden="false"]').innerText(),
      new RegExp(`Fixture page ${number}(?:\\s|$)`),
    );
  }
  assert.equal(await controls.nth(1).isEnabled(), false);
  await page.evaluate(() => window.renderFixture("another-document.docx"));
  await page.waitForFunction(() =>
    document.querySelector("[data-docx-page-navigation]")?.textContent.includes("1 / 20"),
  );
  assert.match(
    await page.locator('section[aria-hidden="false"]').innerText(),
    /Fixture page 1(?:\s|$)/,
  );
  console.log(
    "Office pagination browser checks passed (actual 20-page DOCX, navigation, bounds, source reset and retained DOM)",
  );
} finally {
  await browser.close();
  await server.close();
}
