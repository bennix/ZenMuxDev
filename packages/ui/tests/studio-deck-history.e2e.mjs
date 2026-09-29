import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "../../..");
const bundle = await build({
  stdin: {
    contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { useStudioDeckHistory } from './packages/ui/src/hooks/useStudioDeckHistory.ts';
    import { StudioDeckHistory } from './packages/ui/src/v4/composer/studio/StudioDeckHistory.tsx';
    import * as storage from './packages/ui/src/store/studioDeckHistory.ts';
    window.storage = storage;
    function App() {
      const history = useStudioDeckHistory();
      window.historyTest = history;
      return <><StudioDeckHistory records={history.records} disabled={false} error={history.error}
        onOpen={history.open} onDelete={history.remove} onRefresh={history.refresh} />
        <output>{history.pages.join('|')}</output></>;
    }
    window.addEventListener('DOMContentLoaded', () => createRoot(document.getElementById('root')).render(<App />));
  `,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  alias: { "@": join(root, "packages/ui/src") },
  plugins: [
    {
      name: "test-intl",
      setup(build) {
        build.onResolve({ filter: /IntlProvider\.js$/ }, () => ({
          path: "intl",
          namespace: "test",
        }));
        build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents: `export function useZCodeIntl() { return {intl: {locale:'en-US', formatMessage: ({id}, values) => id.split('.').pop() + (values?.count === undefined ? '' : ' '+values.count)}}; }`,
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
  await page.route("http://localhost/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.addInitScript({ content: bundle.outputFiles[0].text });
  await page.goto("http://localhost/");
  await page.waitForFunction(() => !!window.historyTest);
  for (const title of ["First", "Second", "Third"]) {
    await page.evaluate((title) => {
      window.historyTest.begin(title);
    }, title);
    await page.evaluate((title) => {
      window.historyTest.setPages([title + " page 1", title + " page 2"]);
    }, title);
    await page.waitForFunction(
      (title) => window.historyTest.records.some((r) => r.title === title),
      title,
    );
  }
  await page.reload();
  await page.getByRole("button", { name: "title (3)", exact: true }).click();
  await page.getByRole("button", { name: "Second", exact: true }).click();
  assert.equal(await page.locator("output").textContent(), "Second page 1|Second page 2");
  await page.evaluate(() => window.historyTest.setPages((pages) => [...pages, "edited"]));
  await page.waitForFunction(
    () => window.historyTest.records.find((r) => r.title === "Second")?.pages.length === 3,
  );
  assert.equal(await page.evaluate(() => window.historyTest.records.length), 3);
  const deleted = await page.evaluate(() =>
    window.historyTest.records.find((r) => r.title === "Second"),
  );
  await page.getByRole("checkbox", { name: "First", exact: true }).check();
  await page.getByRole("checkbox", { name: "Second", exact: true }).check();
  await page.getByRole("button", { name: "delete 2", exact: true }).click();
  await page.getByRole("button", { name: "cancel", exact: true }).click();
  assert.equal(await page.evaluate(() => window.historyTest.records.length), 3);
  await page.getByRole("button", { name: "delete 2", exact: true }).click();
  await page.getByRole("button", { name: "confirmDelete", exact: true }).click();
  await page.waitForFunction(() => window.historyTest.records.length === 1);
  assert.equal(await page.locator("output").textContent(), "");
  await page.evaluate(async (record) => {
    await window.storage.saveStudioDeck(record);
  }, deleted);
  await page.reload();
  await page.waitForFunction(() => window.historyTest?.records.length === 1);
  assert.deepEqual(await page.evaluate(() => window.historyTest.records.map((r) => r.title)), [
    "Third",
  ]);
  await page.getByRole("button", { name: "title (1)", exact: true }).click();
  await page.getByRole("checkbox", { name: "all", exact: true }).check();
  await page.getByRole("button", { name: "delete 1", exact: true }).click();
  await page.getByRole("button", { name: "confirmDelete", exact: true }).click();
  await page.waitForFunction(() => window.historyTest.records.length === 0);
  console.log(
    "PASS: persistent history, reopen all pages, edit in place, cancel, batch delete, stale-save protection, select all",
  );
} finally {
  await browser.close();
}
