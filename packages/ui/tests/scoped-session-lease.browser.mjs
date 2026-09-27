import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const server = await createServer({ configFile: false, root: process.cwd(), server: { port: 0 }, resolve: { alias: { "@": `${process.cwd()}/packages/ui/src` } }, plugins: [{ name: "fixture", configureServer(server) { server.middlewares.use((req, res, next) => { if (req.url !== "/") return next(); res.setHeader("Content-Type", "text/html"); res.end('<html><body><div id="app"></div></body></html>'); }); } }] });
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async () => {
    const { React, createRoot } = await import("/packages/ui/tests/weixin-react-entry.js");
    const { useConversationProjection } = await import("/packages/ui/src/v4/useConversationProjection.ts");
    const { currentScopedLease } = await import("/packages/ui/src/v4/scopedSessionLease.ts");
    const owner = {};
    const listeners = new Set();
    let state = { snapshot: { sessionId: "A", text: "old result" }, lastError: "old error" };
    const binding = { owner, sessionId: "A", lease: { store: { subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, getState() { return state; } } } };
    window.lateOldResult = () => { state = { ...state, snapshot: { ...state.snapshot, text: "late old result" } }; for (const fn of listeners) fn(); };
    function Fixture() {
      const [sessionId, setSessionId] = React.useState("A");
      const projection = useConversationProjection(currentScopedLease(binding, owner, sessionId));
      return React.createElement("div", null,
        React.createElement("button", { onClick: () => setSessionId(null) }, "New task"),
        React.createElement("button", { onClick: () => setSessionId("A") }, "History"),
        React.createElement("div", { id: "result" }, projection.snapshot?.text ?? "empty"),
        React.createElement("div", { id: "error" }, projection.lastError));
    }
    createRoot(document.getElementById("app")).render(React.createElement(Fixture));
  });
  await page.getByText("old result", { exact: true }).waitFor();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  assert.equal(await page.locator("#result").innerText(), "empty");
  assert.equal(await page.locator("#error").innerText(), "");
  await page.evaluate(() => window.lateOldResult());
  assert.equal(await page.locator("#result").innerText(), "empty");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByText("late old result", { exact: true }).waitFor();
  console.log("PASS new task masks previous projection and late events; history retained");
} finally { await browser.close(); await server.close(); }
