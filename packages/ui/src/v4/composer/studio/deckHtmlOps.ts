import { stampDeck, stripDeckNoise, topSlides } from "./deckSlides.js";

export interface ElementEdit {
  id: string;
  html: string;
}

export function stripDeckHtml(raw: string): string {
  return raw
    .replace(/^```html\s*/iu, "")
    .replace(/```$/u, "")
    .trim();
}

export function prepareDeckHtml(raw: string): string {
  const doc = new DOMParser().parseFromString(stripDeckHtml(stripDeckNoise(raw)), "text/html");
  for (const script of doc.querySelectorAll("script")) script.remove();
  for (const el of doc.querySelectorAll("*")) {
    const handlers: string[] = [];
    for (const attr of el.attributes) handlers.push(attr.name);
    for (const name of handlers) {
      if (name.toLowerCase().startsWith("on")) el.removeAttribute(name);
    }
  }
  stampDeck(doc);
  let next = 1;
  const usedIds = new Set<string>();
  for (const el of doc.body.querySelectorAll("[data-pptx-kind], [data-pptx-id]")) {
    let id = el.getAttribute("data-pptx-id");
    // 模型重复使用 ID 时，querySelector 只会命中第一个，必须先修正以避免误改元素。
    if (!id || usedIds.has(id)) {
      do {
        id = `el-${next++}`;
      } while (usedIds.has(id) || doc.querySelector(`[data-pptx-id="${id}"]`));
      el.setAttribute("data-pptx-id", id);
    }
    usedIds.add(id);
  }
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export function deckSectionHtml(html: string): string[] {
  const doc = new DOMParser().parseFromString(prepareDeckHtml(html), "text/html");
  const sections = topSlides(doc);
  if (sections.length === 0) return [doc.body.innerHTML];
  return sections.map((section) => section.outerHTML);
}

export function describeElements(html: string, ids: readonly string[]): string {
  const wanted = new Set(ids);
  const doc = new DOMParser().parseFromString(prepareDeckHtml(html), "text/html");
  const lines: string[] = [];
  for (const el of doc.querySelectorAll("[data-pptx-id]")) {
    const id = el.getAttribute("data-pptx-id");
    if (!id || !wanted.has(id)) continue;
    const kind = el.getAttribute("data-pptx-kind") ?? "text";
    if (kind === "image" || el.tagName === "IMG") {
      lines.push(`id=${id} kind=image`);
      continue;
    }
    lines.push(`id=${id} kind=${kind}\n${el.outerHTML}`);
  }
  return lines.join("\n\n");
}

export function parseElementEdits(text: string): ElementEdit[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { id?: unknown; html?: unknown };
    return typeof record.id === "string" &&
      record.id &&
      typeof record.html === "string" &&
      record.html
      ? [{ id: record.id, html: record.html }]
      : [];
  });
}

export function replaceDeckElements(html: string, edits: readonly ElementEdit[]): string {
  const doc = new DOMParser().parseFromString(prepareDeckHtml(html), "text/html");
  for (const edit of edits) {
    const current = doc.querySelector(`[data-pptx-id="${CSS.escape(edit.id)}"]`);
    if (!current) continue;
    const holder = doc.createElement("div");
    holder.innerHTML = edit.html.trim();
    const next = holder.firstElementChild;
    if (!next) continue;
    next.setAttribute("data-pptx-id", edit.id);
    const kind = current.getAttribute("data-pptx-kind");
    if (kind && !next.getAttribute("data-pptx-kind")) next.setAttribute("data-pptx-kind", kind);
    current.replaceWith(next);
  }
  return prepareDeckHtml(`<!doctype html>\n${doc.documentElement.outerHTML}`);
}
