/**
 * 用真实 Chromium 打开谷歌搜索。
 * 不走付费搜索接口。隐藏窗口仍是完整浏览器，用来避开接口对人机验证的拦截。
 */
import { BrowserWindow } from "electron";
import {
  clampDuckDuckGoQuery,
  normalizeDuckDuckGoHits,
  type DuckDuckGoHit,
} from "@zcode/shared";

const SEARCH_TIMEOUT_MS = 36_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const cache = new Map<string, { readonly at: number; readonly hits: readonly DuckDuckGoHit[] }>();
let queue: Promise<unknown> = Promise.resolve();
let searchWindow: BrowserWindow | null = null;

function getSearchWindow(): BrowserWindow {
  if (searchWindow && !searchWindow.isDestroyed()) {
    searchWindow.show();
    return searchWindow;
  }
  searchWindow = new BrowserWindow({
    show: true,
    title: "联网检索",
    width: 1100,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: "persist:zencode-web-search",
    },
  });
  searchWindow.webContents.setUserAgent(BROWSER_USER_AGENT);
  searchWindow.on("closed", () => {
    searchWindow = null;
  });
  return searchWindow;
}

const EXTRACT_RESULTS = `(() => {
  const clean = (value) => (value || "").replace(/\\s+/g, " ").trim();
  const dismissConsent = () => {
    const labels = ["全部接受", "接受全部", "Accept all", "I agree", "同意", "Reject all", "全部拒绝"];
    for (const button of document.querySelectorAll("button, [role='button']")) {
      const label = clean(button.textContent);
      if (labels.some((item) => label === item || label.startsWith(item))) {
        button.click();
        return true;
      }
    }
    return false;
  };
  const read = () => {
    const hits = [];
    const seen = new Set();
    const headings = Array.from(document.querySelectorAll("#search h3, #rso h3")).slice(0, 6);
    for (const heading of headings) {
      const title = clean(heading.textContent);
      const anchor = heading.closest("a");
      const card = heading.closest("div.g, div.MjjYud") || heading.parentElement?.parentElement;
      const snippet = clean(card?.innerText).slice(0, 700);
      const url = anchor?.href || "";
      if (!title || !url || seen.has(url)) continue;
      seen.add(url);
      hits.push({ title, url, snippet: snippet || title });
    }
    const numbers = Array.from(
      document.querySelectorAll(".IsqQVc, .wT3VGc, [data-attrid='Price'], span[jsname='vWLAgc'], [data-attrid]"),
    )
      .map((node) => {
        const label = node.getAttribute("data-attrid") || "数值";
        const text = clean(node.innerText);
        return text.length > 0 && text.length <= 80 && /\\d/.test(text) ? label + ": " + text : "";
      })
      .filter(Boolean)
      .slice(0, 6)
      .join(" | ");
    if (numbers) {
      hits.unshift({ title: "当前数值", url: location.href, snippet: numbers.slice(0, 900) });
    }
    const overview = clean(
      document.querySelector("#rhs, [data-attrid*='finance'], [data-attrid*='kc:']")?.innerText,
    ).slice(0, 900);
    if (overview) {
      hits.unshift({ title: "谷歌概览", url: location.href, snippet: overview });
    }
    return hits;
  };
  const deadline = Date.now() + 7000;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const poll = async () => {
    while (Date.now() < deadline) {
      dismissConsent();
      const hits = read();
      if (hits.length > 0) return hits;
      await wait(400);
    }
    return read();
  };
  return poll();
})()`;

const EXTRACT_DUCKDUCKGO = `(() => {
  const clean = (value) => (value || "").replace(/\\s+/g, " ").trim();
  const read = () =>
    Array.from(document.querySelectorAll("[data-testid='result']"))
      .slice(0, 6)
      .map((article) => {
        const anchor = article.querySelector("[data-testid='result-title-a']");
        const text = clean(article.innerText);
        return {
          title: clean(anchor?.textContent) || text.slice(0, 120),
          url: anchor?.href || "",
          snippet: text.slice(0, 700),
        };
      })
      .filter((hit) => hit.title && hit.url && !hit.url.includes("duckduckgo.com/y.js"));
  const deadline = Date.now() + 8000;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const poll = async () => {
    while (Date.now() < deadline) {
      if (document.querySelector(".anomaly-modal__modal")) return [];
      const hits = read();
      if (hits.length > 0) return hits;
      await wait(400);
    }
    return read();
  };
  return poll();
})()`;

async function readSearchHits(win: BrowserWindow): Promise<DuckDuckGoHit[]> {
  const script = win.webContents.getURL().includes("duckduckgo.com")
    ? EXTRACT_DUCKDUCKGO
    : EXTRACT_RESULTS;
  const raw = await win.webContents.executeJavaScript(script, true);
  return normalizeDuckDuckGoHits(Array.isArray(raw) ? (raw as DuckDuckGoHit[]) : []);
}

function readCache(query: string): readonly DuckDuckGoHit[] | undefined {
  const cached = cache.get(query);
  if (!cached) return undefined;
  if (Date.now() - cached.at > CACHE_TTL_MS) {
    cache.delete(query);
    return undefined;
  }
  return cached.hits;
}

async function searchOnce(query: string): Promise<readonly DuckDuckGoHit[]> {
  const cached = readCache(query);
  if (cached) return cached;
  const win = getSearchWindow();
  const timedOut = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error("search timeout")), SEARCH_TIMEOUT_MS);
  });
  try {
    const hits = await Promise.race([
      (async () => {
        await win.loadURL(
          `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=zh-CN&num=8`,
        );
        let found = await readSearchHits(win);
        if (found.length === 0 && !win.isDestroyed()) {
          await win.loadURL(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web&kp=-2`);
          found = await readSearchHits(win);
        }
        return found;
      })(),
      timedOut,
    ]);
    if (hits.length > 0) cache.set(query, { at: Date.now(), hits });
    return hits;
  } catch {
    return [];
  }
}

export function searchDuckDuckGo(rawQuery: string): Promise<readonly DuckDuckGoHit[]> {
  const query = clampDuckDuckGoQuery(rawQuery);
  if (!query) return Promise.resolve([]);
  const run = queue.then(
    () => searchOnce(query),
    () => searchOnce(query),
  );
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
