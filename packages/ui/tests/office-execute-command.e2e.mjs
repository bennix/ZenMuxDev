import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright-core";

test("Office execution shows the command and expands its output", async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ExecuteToolCallBlock} from './packages/ui/src/ToolCallBlocks/renderers/execute.tsx'; createRoot(document.getElementById('root')).render(<ExecuteToolCallBlock isOfficeMode={true} isRunning={false} statusLabel="done" toolCallNode={{toolCall:{toolId:'office-command-fixture',kind:'execute',status:'completed',input:{command:'printf hello'},output:'hello-output'}}}/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    tsconfig: "packages/ui/tsconfig.json",
    plugins: [
      {
        name: "intl-fixture",
        setup(b) {
          b.onResolve({ filter: /i18n\/IntlProvider\.js$/ }, () => ({
            path: "intl",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents: `export function useZCodeIntl(){return {intl:{formatMessage:({id})=>id}}}`,
          }));
        },
      },
    ],
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const summary = page.getByText("printf hello", { exact: true });
    await summary.waitFor({ timeout: 5000 });
    assert.equal(await page.getByText("hello-output", { exact: true }).count(), 0);
    await summary.click();
    await page.getByText("hello-output", { exact: true }).waitFor({ timeout: 5000 });
  } finally {
    await browser.close();
  }
});
