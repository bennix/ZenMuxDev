/** DuckDuckGo 检索结果。工作区 Agent 用它引用当前公开事实。 */
export interface DuckDuckGoHit {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

const MAX_QUERY_LENGTH = 160;
const MAX_HITS = 5;

export function clampDuckDuckGoQuery(query: string): string {
  return query.replace(/\s+/gu, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

/** 去掉 DuckDuckGo 跳转链接，留下真实网址。 */
export function unwrapDuckDuckGoUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const target = parsed.searchParams.get("uddg");
    if (target && (parsed.hostname.endsWith("duckduckgo.com") || parsed.pathname === "/l/")) {
      return target;
    }
  } catch {
    return url;
  }
  return url;
}

export function normalizeDuckDuckGoHits(hits: readonly DuckDuckGoHit[]): DuckDuckGoHit[] {
  const seen = new Set<string>();
  const normalized: DuckDuckGoHit[] = [];
  for (const hit of hits) {
    const title = hit.title.replace(/\s+/gu, " ").trim();
    const url = unwrapDuckDuckGoUrl(hit.url.trim());
    const snippet = hit.snippet.replace(/\s+/gu, " ").trim();
    if (!title || !url || url.includes("duckduckgo.com/y.js")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    normalized.push({ title, url, snippet });
    if (normalized.length >= MAX_HITS) break;
  }
  return normalized;
}

export function formatDuckDuckGoHits(hits: readonly DuckDuckGoHit[]): string {
  if (hits.length === 0) {
    return "谷歌没有返回结果。不要把记忆里的价格、日期或新闻说成当前事实。";
  }
  return hits
    .map((hit, index) => `${index + 1}. ${hit.title}\n${hit.url}\n${hit.snippet || "（无摘要）"}`)
    .join("\n\n");
}
