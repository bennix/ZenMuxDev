export interface DeckPagePlan { title: string; type: string; brief: string; layout: string }
export interface DeckOutline { coreHook: string; pages: DeckPagePlan[] }
type OutlineResult = { ok: true; outline: DeckOutline } | { ok: false; reason: string };

/** 从完整对象边界提取 JSON，字符串中的花括号不能改变结构深度。 */
function jsonObjects(raw: string): string[] {
  const candidates: string[] = [];
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (start < 0) { if (char === "{") { start = i; depth = 1; } continue; }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) { candidates.push(raw.slice(start, i + 1)); start = -1; }
  }
  return candidates;
}

function validate(value: unknown, count: number): OutlineResult {
  if (!value || typeof value !== "object" || !Array.isArray((value as {pages?:unknown}).pages)) {
    return {ok:false, reason:"目录缺少 pages 数组"};
  }
  const record = value as {pages:unknown[]; core_hook?:unknown};
  if (record.pages.length !== count) return {ok:false, reason:`目录需要 ${count} 页，实际返回 ${record.pages.length} 页`};
  const pages: DeckPagePlan[] = [];
  for (const [index, item] of record.pages.entries()) {
    if (!item || typeof item !== "object") return {ok:false, reason:`第 ${index+1} 页不是对象`};
    const page = item as Partial<Record<keyof DeckPagePlan, unknown>>;
    if (typeof page.title !== "string" || !page.title.trim()) return {ok:false, reason:`第 ${index+1} 页缺少非空 title（标题）`};
    if (typeof page.brief !== "string" || !page.brief.trim()) return {ok:false, reason:`第 ${index+1} 页缺少非空 brief（内容提要）`};
    pages.push({title:page.title.trim(),brief:page.brief.trim(),type:typeof page.type === "string" ? page.type : "content",layout:typeof page.layout === "string" ? page.layout : ""});
  }
  return {ok:true,outline:{coreHook:typeof record.core_hook === "string" ? record.core_hook : "",pages}};
}

export function parseDeckOutline(raw: string, count: number): OutlineResult {
  if (!raw.trim()) return {ok:false,reason:"模型目录回复为空"};
  // 原先截取首尾大括号，会把解释中的示例也拼进 JSON，合法目录因此被拒绝。
  const fences = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)].flatMap(match => jsonObjects(match[1] ?? ""));
  let failure: OutlineResult = {ok:false,reason:"目录不是完整有效的 JSON，可能被截断或返回了其他格式"};
  for (const candidate of [...fences, ...jsonObjects(raw)]) {
    let parsed: unknown;
    try { parsed = JSON.parse(candidate); } catch { continue; }
    const result = validate(parsed, count);
    if (result.ok) return result;
    if (parsed && typeof parsed === "object" && "pages" in parsed) return result;
    failure = result;
  }
  return failure;
}
