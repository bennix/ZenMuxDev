import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const root = resolve(import.meta.dirname, "../..");

test("landing release copy, locale persistence and seven installer links on desktop/mobile", async () => {
  const server = createServer(async (req, res) => {
    const path = resolve(
      root,
      "." + new URL(req.url, "http://localhost").pathname.replace(/\/$/u, "/index.html"),
    );
    if (!path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(path);
      res.setHeader(
        "Content-Type",
        { ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg" }[
          extname(path)
        ] || "application/octet-stream",
      );
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "zh-CN", reducedMotion: "reduce" });
    await page.route("**/*.mp4", (route) => route.abort());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(process.env.LANDING_TEST_URL || `http://127.0.0.1:${server.address().port}`, {
      waitUntil: "domcontentloaded",
    });
    const expected = [
      "mac-arm64.dmg",
      "win-x64.exe",
      "win-arm64.exe",
      "linux-amd64.deb",
      "linux-x86_64.rpm",
      "linux-arm64.deb",
      "linux-aarch64.rpm",
    ].map((x) => `https://github.com/bennix/ZCode/releases/download/v3.14.35/ZenCode-3.14.35-${x}`);
    assert.deepEqual(
      new Set(
        await page
          .locator('#download a[href*="/releases/download/"]')
          .evaluateAll((nodes) => nodes.map((n) => n.href)),
      ),
      new Set(expected),
    );
    for (const width of [1280, 1920, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const language of ["zh-CN", "en"]) {
        if ((await page.locator("html").getAttribute("lang")) !== language)
          await page.locator("#language-toggle").click();
        const statement = page.locator('[data-i18n="hero.statement"]');
        assert.equal(
          await statement.textContent(),
          language === "en"
            ? "Fed up with account bans, closed ecosystems, and the lack of control that come with relying on a single vendor, I built my own: keep the client and model routing in your hands, switch models whenever you want, and keep your workflow."
            : "受够了单一厂商的封号、封闭和不可控，干脆自己做：客户端和调度握在自己手里，模型可以随时换，工作流不用换。",
        );
        assert.ok(await statement.isVisible());
        assert.equal(
          await page.locator('[data-i18n="hero.foundationTitle"]').textContent(),
          language === "en"
            ? "Several flagship products. One shared ZenMux foundation."
            : "几个旗舰产品，共用一个 ZenMux 底座。",
        );
        const foundation = page.locator('[data-i18n="hero.foundationText"]');
        assert.ok(await foundation.isVisible());
        assert.match(await foundation.textContent(), language === "en" ? /local credential management/u : /本地凭证管理/u);
        const gridBox = await page.locator(".download-grid").boundingBox();
        const trailingNoteBox = await page.locator('[data-i18n="download.note"]').boundingBox();
        assert.ok(
          trailingNoteBox.y - (gridBox.y + gridBox.height) >= 12,
          `download note must clear the cards by 12px (${width}px, ${language})`,
        );
        const note = await page.locator('[data-i18n="download.refreshNote"]').textContent();
        assert.match(note, /2026-10-23/u);
        assert.match(note, language === "en" ? /reinstall/iu : /重新安装/u);
        const release = await page.locator('[data-i18n="release.32.text"]').textContent();
        assert.match(release, /20/u);
        assert.match(
          await page.locator('[data-i18n="feature.tokens.text"]').textContent(),
          language === "en" ? /original/iu : /原文/u,
        );
        assert.match(
          await page.locator('[data-i18n="faq.cost.a"]').textContent(),
          language === "en" ? /subscription/iu : /订阅/u,
        );
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
      }
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.deepEqual(errors, []);
    await page.locator("#release").evaluate((node) => node.scrollIntoView({ block: "start" }));
    const heading = await page.locator("#release h2").boundingBox();
    const header = await page.locator("header").boundingBox();
    assert.ok(
      heading.y >= header.y + header.height,
      "release heading must remain below the sticky header",
    );
    if (process.env.LANDING_SCREENSHOT) {
      await page.locator("#language-toggle").click();
      await page.locator("#release").screenshot({ path: process.env.LANDING_SCREENSHOT });
    }
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
});
