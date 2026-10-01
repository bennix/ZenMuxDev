import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright-core";

test("composer control buttons follow loaded plugin state and failed writes", async () => {
  const mocks = {
    "@zcode/shared":
      'export const ZCODE_CUA_OFFICIAL_PLUGIN_ID = "computer-use@zcode-plugins-official";',
    "@/hooks/useServices.js":
      "export const useOptionalServices = () => ({pluginManagementService: {}});",
    "@/i18n/IntlProvider.js":
      "export const useZCodeIntl = () => ({intl:{formatMessage:({id})=>id}});",
    "@/components/ui/button.js":
      'import React from "react"; export function Button(props){return React.createElement("button",props)}',
    "@/components/lib/utils.js":
      'export const cn = (...values) => values.filter(Boolean).join(" ");',
    "@/store/pluginManagementStore.js": `
      import {useSyncExternalStore} from 'react';
      const listeners = new Set();
      const emit = () => { for(const listener of listeners) listener(); };
      window.__emitPluginState = emit;
      window.__mockPluginState = {
        workspacePath:null,workspaceIdentity:null,plugins:[],loading:false,error:null,lastFailedPluginId:null,togglingPluginId:null,
        initialize: async ({workspacePath,workspaceIdentity}) => {
          Object.assign(window.__mockPluginState,{workspacePath,workspaceIdentity:workspaceIdentity??null,plugins:[{id:'browser-use@zcode-plugins-official',enabled:true}],loading:false});emit();
        },
        setEnabled: async (id,enabled) => {
          if(!window.__mockToggleSucceeds){Object.assign(window.__mockPluginState,{error:'write failed',lastFailedPluginId:id});emit();return false}
          Object.assign(window.__mockPluginState,{plugins:window.__mockPluginState.plugins.map(p=>p.id===id?{...p,enabled}:p),error:null,lastFailedPluginId:null});emit();return true;
        },
      };
      export const usePluginManagementStore = (selector) => useSyncExternalStore(
        listener => {listeners.add(listener);return () => listeners.delete(listener)},
        () => selector(window.__mockPluginState),
      );`,
  };
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {V4ComposerControlToggles} from './packages/ui/src/v4/composer/V4ComposerControlToggles.tsx';createRoot(document.getElementById('root')).render(<V4ComposerControlToggles workspacePath="/tmp/project" />);`,
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
        name: "control-toggle-mocks",
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /^(?:@zcode\/shared|@\/.*\.js)$/ }, ({ path }) =>
            Object.hasOwn(mocks, path) ? { path, namespace: "control-toggle-mock" } : undefined,
          );
          pluginBuild.onLoad({ filter: /.*/, namespace: "control-toggle-mock" }, ({ path }) => ({
            contents: mocks[path],
            loader: "js",
            resolveDir: process.cwd(),
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
    const computer = page.getByRole("button", { name: "chat.toolbar.control.computer" });
    const browserControl = page.getByRole("button", { name: "chat.toolbar.control.browser" });
    await browserControl.waitFor();
    assert.equal(await computer.getAttribute("aria-pressed"), "false");
    assert.equal(await computer.isDisabled(), true);
    assert.equal(await browserControl.getAttribute("aria-pressed"), "true");
    await browserControl.click();
    assert.equal(await browserControl.getAttribute("aria-pressed"), "true");
    await page.evaluate(() => {
      window.__mockToggleSucceeds = true;
    });
    await browserControl.click();
    assert.equal(await browserControl.getAttribute("aria-pressed"), "false");
    await page.evaluate(() => {
      window.__mockPluginState.plugins = [
        ...window.__mockPluginState.plugins,
        { id: "computer-use@zcode-plugins-official", enabled: true },
      ];
      window.__emitPluginState();
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector('button[aria-label="chat.toolbar.control.computer"]')
          ?.getAttribute("aria-pressed") === "true",
    );
    assert.equal(await computer.getAttribute("aria-pressed"), "true");
    assert.equal(await computer.isDisabled(), false);
  } finally {
    await browser.close();
  }
});
