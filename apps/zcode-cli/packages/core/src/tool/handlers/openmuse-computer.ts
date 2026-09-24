import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import ipaddr from "ipaddr.js";
import {
  ZENMUX_BASE_URL,
  ZENMUX_SYSTEM_ONE_MODEL_ID,
  ZENMUX_TEMPLATE_ID,
  callZenMuxSystemOne,
} from "@zcode/shared";
import type { ToolEntry, ToolHandler } from "../types.js";

const TOOL_NAME = "ComputerUse";
const TIMEOUT_MS = 60_000;

interface BrowserPage {
  goto(url: string, options: { timeout: number; waitUntil: "domcontentloaded" }): Promise<unknown>;
  title(): Promise<string>;
  url(): string;
  innerText(selector: string): Promise<string>;
  mouse: {
    click(x: number, y: number): Promise<void>;
    wheel(deltaX: number, deltaY: number): Promise<void>;
  };
  keyboard: { type(text: string): Promise<void>; press(key: string): Promise<void> };
  evaluate(fn: () => string): Promise<string>;
  screenshot(options: { type: "png" }): Promise<Buffer>;
  close(): Promise<void>;
}

interface BrowserSession {
  page: BrowserPage;
  close(): Promise<void>;
}

const sessions = new Map<string, BrowserSession>();
const ALLOWED_KEYS = new Set([
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

const COMPUTER_ACTIONS = ["navigate", "read", "click", "type", "key", "scroll", "done"] as const;

async function readZenMuxApiKey(): Promise<string | undefined> {
  const fromEnv = process.env.ZENMUX_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const base = process.env.ZCODE_DATA_BASE_DIR?.trim() || homedir();
  const filePath = join(base, ".zcode", "v2", "provider_config.json");
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as {
      config?: { providerConfigRules?: { providerRules?: unknown[] } };
    };
    const rules = parsed.config?.providerConfigRules?.providerRules ?? [];
    for (const rule of rules) {
      if (!rule || typeof rule !== "object") continue;
      const record = rule as {
        templateId?: string;
        config?: { access?: { apiKey?: string } };
      };
      if (record.templateId !== ZENMUX_TEMPLATE_ID) continue;
      const key = record.config?.access?.apiKey?.trim();
      if (key) return key;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Computer Use 只允许 http 或 https");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Computer Use 不访问本机或内网地址");
  }
  const records = await lookup(host, { all: true });
  for (const record of records) {
    const address = ipaddr.parse(record.address);
    const range = address.range();
    if (range !== "unicast") throw new Error("Computer Use 不访问保留地址");
  }
  return url;
}

async function openSession(sessionId: string, url: string): Promise<BrowserSession> {
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  if (sessions.size >= 3) throw new Error("Computer Use 最多同时打开 3 个浏览器会话");
  const playwrightPackage = "playwright";
  const playwright = (await import(playwrightPackage).catch(() => null)) as {
    chromium: {
      launch(options: { headless: boolean }): Promise<{
        newPage(): Promise<BrowserPage>;
        close(): Promise<void>;
      }>;
    };
  } | null;
  if (!playwright) throw new Error("未安装 playwright。请先执行 pnpm add playwright 并安装 Chromium。");
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  const session = {
    page,
    close: () => browser.close(),
  };
  sessions.set(sessionId, session);
  await assertPublicHttpUrl(url);
  await page.goto(url, { timeout: 20_000, waitUntil: "domcontentloaded" });
  return session;
}

async function pageState(page: BrowserPage): Promise<{ url: string; title: string; text: string }> {
  const text = (await page.innerText("body").catch(() => "")).slice(0, 20_000);
  return { url: page.url(), title: await page.title(), text };
}

async function decideWithJev(goal: string, state: { url: string; title: string; text: string }) {
  const apiKey = await readZenMuxApiKey();
  if (!apiKey) throw new Error("未找到已验证的 ZenMux API Key。请先在设置页保存。");
  return callZenMuxSystemOne(apiKey, {
    model: ZENMUX_SYSTEM_ONE_MODEL_ID,
    state: { goal, ...state },
    questions: {
      goal_done: {
        type: "noul",
        instructions: "根据当前页面文本，目标是否已经完成？",
      },
      next_action: {
        type: "choice",
        instructions: "要完成目标，下一步应该做哪一类浏览器动作？",
        criteria: {
          navigate: "打开另一个公开网页",
          read: "继续阅读当前页面",
          click: "点击页面上的控件",
          type: "在输入框中输入文字",
          key: "按一个按键",
          scroll: "滚动页面",
          done: "目标已完成，停止操作",
        },
      },
    },
  });
}

const handler: ToolHandler = async (input) => {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const action = typeof raw.action === "string" ? raw.action : "";
  const sessionId = typeof raw.sessionId === "string" && raw.sessionId.trim() ? raw.sessionId.trim() : "default";
  if (action === "close") {
    const session = sessions.get(sessionId);
    if (session) {
      await session.close();
      sessions.delete(sessionId);
    }
    return { sessionId, closed: true };
  }
  if (action === "navigate") {
    const url = typeof raw.url === "string" ? raw.url : "";
    const session = await openSession(sessionId, url);
    if (sessions.has(sessionId) && session.page.url() !== url) {
      await assertPublicHttpUrl(url);
      await session.page.goto(url, { timeout: 20_000, waitUntil: "domcontentloaded" });
    }
    return { sessionId, ...(await pageState(session.page)) };
  }
  const session = sessions.get(sessionId);
  if (!session) throw new Error("没有浏览器会话。请先用 navigate 打开公开网页。");
  if (action === "read" || action === "decide") {
    const state = await pageState(session.page);
    if (action === "read") return { sessionId, ...state };
    const goal = typeof raw.goal === "string" ? raw.goal : "";
    if (!goal.trim()) throw new Error("decide 需要 goal");
    return { sessionId, state, decision: await decideWithJev(goal, state), model: ZENMUX_SYSTEM_ONE_MODEL_ID };
  }
  if (action === "click") {
    const x = Number(raw.x);
    const y = Number(raw.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("click 需要数字坐标 x 和 y");
    await session.page.mouse.click(x, y);
    return { sessionId, clicked: { x, y } };
  }
  if (action === "type") {
    const text = typeof raw.text === "string" ? raw.text.slice(0, 10_000) : "";
    await session.page.keyboard.type(text);
    return { sessionId, typed: text.length };
  }
  if (action === "key") {
    const key = typeof raw.key === "string" ? raw.key : "";
    if (!ALLOWED_KEYS.has(key)) throw new Error("不支持的按键");
    await session.page.keyboard.press(key);
    return { sessionId, key };
  }
  if (action === "scroll") {
    const deltaY = Math.max(-5_000, Math.min(5_000, Number(raw.deltaY) || 0));
    await session.page.mouse.wheel(0, deltaY);
    return { sessionId, deltaY };
  }
  if (action === "screenshot") {
    const png = await session.page.screenshot({ type: "png" });
    return { sessionId, bytes: png.byteLength, mimeType: "image/png" };
  }
  throw new Error(`未知动作 ${action}。可用：navigate、read、decide、click、type、key、scroll、screenshot、close`);
};

export const computerUseToolEntry: ToolEntry = {
  capability: "Drive a local browser and ask typesafe/jev-1.13 which action to take",
  metadata: {
    name: TOOL_NAME,
    description: [
      "OpenMuse-style computer use on a local Chromium session.",
      "navigate/read/click/type/key/scroll/screenshot/close control the browser.",
      "decide sends the page text and goal to typesafe/jev-1.13 via POST /api/v1/systemone.",
      "Jev is not a chat model: it returns a typed next_action and goal_done probability.",
      "Only public http(s) pages. Do not use it for login, payment, or private networks.",
      `next_action is one of: ${COMPUTER_ACTIONS.join(", ")}.`,
    ].join("\n"),
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: TIMEOUT_MS,
    maxOutputBytes: 48_000,
    sideEffectScope: "network",
    riskLevel: "medium",
    needsApproval: true,
  },
  handler,
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string" },
      sessionId: { type: "string" },
      url: { type: "string" },
      goal: { type: "string" },
      x: { type: "number" },
      y: { type: "number" },
      text: { type: "string" },
      key: { type: "string" },
      deltaY: { type: "number" },
    },
    required: ["action"],
  },
  outputSchema: { type: "object" },
  permission: {
    permission: "computerUse",
    reason: "ComputerUse controls a local browser and calls ZenMux System One",
    riskLevel: "medium",
    sideEffectScope: "network",
    needsApproval: true,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["none"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 48_000,
    maxModelBytes: 48_000,
    strategy: "truncate",
    preview: { maxBytes: 4_000, direction: "head" },
  },
  timeout: { kind: "timed", defaultMs: TIMEOUT_MS, maxMs: TIMEOUT_MS, allowCallOverride: false },
  cancellation: {
    supported: false,
    cleanup: "none",
    userVisibleMessage: "ComputerUse cannot be cancelled mid-action",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
  formatModelContent: (output) => JSON.stringify(output),
};
