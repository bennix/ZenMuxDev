import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { port: 0 },
  resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async () => {
    const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
    const { useSkillCatalogRefresh } =
      await import("/packages/ui/src/hooks/useSkillCatalogRefresh.ts");
    let callback;
    let count = 0;
    const service = {
      onDynamicWorkspaceEvent: () => (fn) => {
        callback = fn;
        return {
          dispose() {
            callback = null;
          },
        };
      },
    };
    const refresh = async () => {
      count++;
      document.getElementById("count").textContent = String(count);
    };
    function Probe() {
      useSkillCatalogRefresh({
        workspacePath: "/project",
        workspaceIdentity: "host-a",
        taskService: service,
        enabled: true,
        refresh,
      });
      return React.createElement("div", { id: "count" }, "0");
    }
    document.body.innerHTML = '<div id="app"></div>';
    const root = createRoot(document.getElementById("app"));
    root.render(React.createElement(Probe));
    window.emitSkillEvent = (identity, status = "completed") =>
      callback?.({
        type: "workspace_task_list_changed",
        reason: "task_status_changed",
        workspacePath: "/project",
        workspaceIdentity: identity,
        taskMeta: { status },
      });
    window.unmountSkillProbe = () => root.unmount();
    window.hasSkillSubscription = () => Boolean(callback);
    window.skillRefreshCount = () => count;
  });
  await page.waitForFunction(() => window.hasSkillSubscription());
  await page.evaluate(() => window.emitSkillEvent("host-a"));
  await page.waitForFunction(() => window.skillRefreshCount() === 1);
  await page.evaluate(() => {
    window.emitSkillEvent("host-b");
    window.emitSkillEvent("host-a", "running");
  });
  assert.equal(await page.evaluate(() => window.skillRefreshCount()), 1);
  await page.evaluate(() => window.emitSkillEvent("host-a", "error"));
  await page.waitForFunction(() => window.skillRefreshCount() === 2);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => window.skillRefreshCount() === 3);
  await page.evaluate(() => window.unmountSkillProbe());
  assert.equal(await page.evaluate(() => window.hasSkillSubscription()), false);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  assert.equal(await page.evaluate(() => window.skillRefreshCount()), 3);
  const identity = await page.evaluate(async () => {
    const { useSkillStore } = await import("/packages/ui/src/store/skillStore.ts");
    const result = (name) => ({
      skills: [{ name }],
      capability: { userScopeAvailable: true },
      diagnostics: [],
    });
    let finishOldScan;
    const oldService = {
      list: () =>
        new Promise((resolve) => {
          finishOldScan = resolve;
        }),
    };
    const newService = { list: async () => result("new-host-skill") };
    const oldRequest = useSkillStore
      .getState()
      .initialize("/same-path", oldService, undefined, "old-host");
    await useSkillStore.getState().initialize("/same-path", newService, undefined, "new-host");
    finishOldScan(result("old-host-skill"));
    await oldRequest;
    return {
      identity: useSkillStore.getState().loadedWorkspaceIdentity,
      name: useSkillStore.getState().skills[0].name,
    };
  });
  assert.deepEqual(identity, { identity: "new-host", name: "new-host-skill" });
  console.log(
    "PASS: completed/error refresh, host isolation, running events ignored, focus refresh, unsubscribe",
  );
} finally {
  await browser.close();
  await server.close();
}
