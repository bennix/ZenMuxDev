import type { EditableHtmlNode, EditableHtmlTextRun } from "./htmlToEditablePptx.js";

const CJK_CHARACTER = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/u;

/** 中文注释：导出不能依赖构建机上的 macOS 字体；替换为 Office 常见跨平台字体。 */
export function resolvePptxFontFace(fontFamily: string, text: string): string {
  const family = fontFamily.toLowerCase();
  const monospace = /mono|menlo|consolas|courier/u.test(family);
  const serif = /serif|songti|simsun|georgia|times/u.test(family) && !/sans-serif/u.test(family);
  if ([...text].some((character) => CJK_CHARACTER.test(character)))
    return serif ? "SimSun" : "Microsoft YaHei";
  if (monospace) return "Courier New";
  return serif ? "Times New Roman" : "Arial";
}

function cssColor(value: string): string | undefined {
  const hex = value.match(/^#?([\da-f]{6})$/iu)?.[1];
  if (hex) return hex.toUpperCase();
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/iu);
  if (!rgb) return undefined;
  return rgb
    .slice(1, 4)
    .map((part) =>
      Math.max(0, Math.min(255, Number(part)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

function equivalentRun(a: EditableHtmlTextRun, b: EditableHtmlTextRun): boolean {
  return (
    a.fontFace === b.fontFace &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.color === b.color &&
    a.fontSize === b.fontSize
  );
}

function appendRun(
  runs: EditableHtmlTextRun[],
  text: string,
  owner: Element,
  fallback: CSSStyleDeclaration,
): void {
  const style = getComputedStyle(owner);
  const family = style.fontFamily || fallback.fontFamily;
  const fontSize =
    Number.parseFloat(style.fontSize) || Number.parseFloat(fallback.fontSize) || undefined;
  const weight = Number.parseInt(style.fontWeight, 10);
  const color = cssColor(style.color) ?? cssColor(fallback.color);
  for (const character of text) {
    const next: EditableHtmlTextRun = {
      text: character,
      fontFace: resolvePptxFontFace(family, character),
      bold: Number.isFinite(weight) ? weight >= 600 : style.fontWeight === "bold",
      italic: style.fontStyle === "italic",
      ...(fontSize ? { fontSize } : {}),
      ...(color ? { color } : {}),
    };
    const previous = runs.at(-1);
    if (previous && equivalentRun(previous, next)) previous.text += character;
    else runs.push(next);
  }
}

function trimRuns(runs: EditableHtmlTextRun[]): EditableHtmlTextRun[] {
  const prepared = runs
    .map((run) => ({ ...run, text: run.text.replace(/[ \t]+\n/gu, "\n") }))
    .filter((run) => run.text.length > 0);
  const text = prepared.map((run) => run.text).join("");
  const trimmed = text.trim();
  if (trimmed === text) return prepared;
  let removeStart = text.length - text.trimStart().length;
  let remaining = trimmed.length;
  return prepared.flatMap((run) => {
    const start = Math.min(removeStart, run.text.length);
    removeStart -= start;
    const kept = run.text.slice(start, start + remaining);
    remaining -= kept.length;
    return kept ? [{ ...run, text: kept }] : [];
  });
}

function collectTextRuns(el: HTMLElement, baseStyle: CSSStyleDeclaration): EditableHtmlTextRun[] {
  const runs: EditableHtmlTextRun[] = [];
  const append = (text: string, owner: Element) => appendRun(runs, text, owner, baseStyle);
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      const owner = node.parentElement ?? el;
      append(node.textContent ?? "", owner);
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    if (element !== el) {
      // 嵌套列表由自己的 li 文本框承载，父列表项只收集直属文字，不重复输出子项。
      if (element.tagName === "LI") return;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)
        return;
      if (element.tagName === "BR") {
        append("\n", element.parentElement ?? el);
        return;
      }
      const block =
        style.display === "block" ||
        style.display === "list-item" ||
        style.display === "table-cell";
      if (block && runs.length && !runs.at(-1)?.text.endsWith("\n"))
        append("\n", element.parentElement ?? el);
      for (const child of element.childNodes) visit(child);
      if (block && !runs.at(-1)?.text.endsWith("\n")) append("\n", element);
      return;
    }
    for (const child of element.childNodes) visit(child);
  };
  visit(el);
  let normalized = trimRuns(runs);
  if (el.tagName === "LI") {
    const combined = normalized.map((run) => run.text).join("");
    const marker = combined.match(/^\s*[•◦▪‣]\s*/u)?.[0];
    if (marker) {
      let remaining = marker.length;
      normalized = normalized.flatMap((run) => {
        const count = Math.min(remaining, run.text.length);
        remaining -= count;
        const text = run.text.slice(count);
        return text ? [{ ...run, text }] : [];
      });
    }
  }
  return normalized;
}

function runsForPlainText(
  text: string,
  owner: Element,
  style: CSSStyleDeclaration,
): EditableHtmlTextRun[] {
  const runs: EditableHtmlTextRun[] = [];
  appendRun(runs, text, owner, style);
  return runs;
}

function plainText(runs: readonly EditableHtmlTextRun[]): string {
  return runs.map((run) => run.text).join("");
}

/**
 * 中文注释：块级元素保留一个可换行文本框，脚本切换只形成字体 run；只有跨行的行内元素才按行拆框。
 */
export function measuredTextLines(
  el: HTMLElement,
  root: HTMLElement,
  base: EditableHtmlNode,
): EditableHtmlNode[] {
  const origin = root.getBoundingClientRect();
  const style = getComputedStyle(el);
  const runs = collectTextRuns(el, style);
  const text = plainText(runs);
  if (!text) return [];
  if (style.display !== "inline") {
    const directRun = runs.length === 1 ? runs[0] : undefined;
    return [
      {
        ...base,
        text,
        textRuns: runs,
        fontFace: directRun?.fontFace ?? resolvePptxFontFace(style.fontFamily, text),
        bullet: el.tagName === "LI" || base.bullet,
      },
    ];
  }

  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const lines: { text: string; x: number; y: number; right: number; bottom: number }[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent ?? "";
    for (let index = 0; index < value.length; ) {
      const character = String.fromCodePoint(value.codePointAt(index)!);
      const range = doc.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + character.length);
      index += character.length;
      const rect = range.getBoundingClientRect();
      if (rect.width < 0.1 || rect.height < 0.1 || character === "\n" || character === "\r")
        continue;
      let line = lines.at(-1);
      if (!line || Math.abs(line.y - (rect.y - origin.y)) > 2) {
        line = {
          text: "",
          x: rect.x - origin.x,
          y: rect.y - origin.y,
          right: rect.right - origin.x,
          bottom: rect.bottom - origin.y,
        };
        lines.push(line);
      }
      line.text += character;
      line.right = Math.max(line.right, rect.right - origin.x);
      line.bottom = Math.max(line.bottom, rect.bottom - origin.y);
    }
  }
  if (lines.length <= 1) {
    return [
      { ...base, text, textRuns: runs, fontFace: resolvePptxFontFace(style.fontFamily, text) },
    ];
  }
  return lines
    .filter((line) => line.text.trim())
    .map((line) => {
      const width = line.right - line.x;
      return {
        ...base,
        x: line.x,
        y: line.y,
        w: width + 2,
        h: line.bottom - line.y + 2,
        text: line.text,
        textRuns: runsForPlainText(line.text, el, style),
        fontFace: resolvePptxFontFace(style.fontFamily, line.text),
        align: "left",
        valign: "top",
        noWrap: true,
        widenPx: Math.max(base.widenPx ?? 0, width * 0.04),
        unwrapLines: undefined,
      };
    });
}
