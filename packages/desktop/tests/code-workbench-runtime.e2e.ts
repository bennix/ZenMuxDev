import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { startWorkbench } from "../src/main/code-workbench/process.js";

test(
  "bundled VS Code workbench opens offline, saves files and bridges ZenCode context",
  { timeout: 180_000, skip: !process.env.ZENCODE_IDE_TEST_ROOT },
  async () => {
    const root = process.env.ZENCODE_IDE_TEST_ROOT;
    assert.ok(root, "Set ZENCODE_IDE_TEST_ROOT to an isolated runtime cache");
    const workspace = join(root, "fixture");
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "hello.ts"), 'console.log("ZenCode");\n');
    const received: unknown[] = [];
    const runtime = await startWorkbench({
      root,
      runtimeDirectory: new URL(
        `../bundled-workbench/${process.platform}-${process.arch}`,
        import.meta.url,
      ).pathname,
      stateKey: "smoke-" + Date.now(),
      request: { workspacePath: workspace },
      onContext: (context) => received.push(context),
    });
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const context = await browser.newContext();
      // 验证预置工作台：浏览器禁止外网，编辑与 ZenCode 回传仍须正常。
      await context.route("**/*", (route) =>
        new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
      );
      const page = await context.newPage();

      await page.goto(runtime.origin + "/?folder=" + encodeURIComponent(workspace));
      await page.locator(".monaco-workbench").waitFor({ timeout: 60_000 });
      const trust = page.getByRole("button", { name: /Yes, I trust|Trust.*Continue/ });
      if (await trust.count()) await trust.first().click();
      await page.screenshot({ path: join(root, "workbench.png") });
      // 使用真实命令面板验证扩展已由 VS Code 注册，而非静态 UI 冒充。
      await page.waitForTimeout(2500);
      await page.keyboard.press("F1");
      await page.locator(".quick-input-widget input").fill(">ZenCode:");
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(root, "commands.png") });

      await page
        .getByText(/将选中代码交给 AI/)
        .first()
        .waitFor({ timeout: 10_000 });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Meta+p");
      await page.locator(".quick-input-widget input").fill("hello.ts");
      await page.waitForTimeout(500);
      await page.keyboard.press("Enter");
      await page.locator(".monaco-editor textarea").first().waitFor();
      await page.locator(".monaco-editor .view-lines").first().click();
      await page.locator(".monaco-editor textarea").first().focus();
      await page.keyboard.press("Meta+End");
      await page.keyboard.type("// edited in workbench", { delay: 30 });
      await page.getByText("// edited in workbench", { exact: false }).first().waitFor();
      await page.keyboard.press("F1");
      await page.locator(".quick-input-widget input").fill(">File: Save");
      await page
        .locator("a")
        .filter({ hasText: /^File: Save$/ })
        .click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(root, "edited.png") });
      assert.match(await readFile(join(workspace, "hello.ts"), "utf8"), /edited in workbench/);
      await page.keyboard.press("F1");
      await page.locator(".quick-input-widget input").fill(">ZenCode:");
      await page
        .getByText(/将选中代码交给 AI/)
        .first()
        .click();
      await page.getByPlaceholder("解释、排错、重构或实现功能…").fill("Explain this code");
      await page.keyboard.press("Enter");
      await page
        .getByText("已交给 ZenCode。请回到 AI 对话查看并发送。")
        .first()
        .waitFor({ timeout: 30000 });
      await page.keyboard.press("F1");
      await page.locator(".quick-input-widget input").fill(">ZenCode:");
      await page
        .getByText(/导入扩展 \/ Import Extension/)
        .first()
        .click();
      await page.getByText("网页链接或扩展 ID / Web link or ID", { exact: true }).click();
      await page
        .getByPlaceholder("粘贴扩展网页链接 / Paste extension link")
        .fill("https://open-vsx.org/extension/pub/ext");
      await page.keyboard.press("Enter");
      await page
        .getByText(/请在扩展列表确认安装/)
        .first()
        .waitFor({ timeout: 15000 });
      assert.equal(received.length, 1);
      assert.equal((received[0] as { comment: string }).comment, "Explain this code");
      await page.screenshot({ path: join(root, "workbench.png") });
    } finally {
      await browser.close();
      runtime.dispose();
    }
  },
);
