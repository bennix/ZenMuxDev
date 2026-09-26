/**
 * 预览以前只抽出当前 section。父级选择器因此失效，后写的色块又盖住正文，
 * 浅字落在浅底上，页面就只剩页眉和页脚。这里在整份文档上只隐藏其他页，并把正文露出来。
 */

const TEXT_SELECTOR = "[data-pptx-kind='text'], h1, h2, h3, h4, p, li, pre, code";

function parsedRgb(value: string): [number, number, number, number] | null {
  const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/u);
  if (!match) return null;
  const alphaRaw = match[4];
  const alpha = alphaRaw == null || alphaRaw === ""
    ? 1
    : alphaRaw.endsWith("%")
      ? Number(alphaRaw.slice(0, -1)) / 100
      : Number(alphaRaw);
  return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
}

function luminance(rgb: [number, number, number]): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(ink: [number, number, number], paper: [number, number, number]): number {
  const left = luminance(ink);
  const right = luminance(paper);
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

function opaqueRgb(value: string): [number, number, number] | null {
  const parsed = parsedRgb(value);
  if (!parsed || parsed[3] < 0.45) return null;
  return [parsed[0], parsed[1], parsed[2]];
}

interface InkSurface {
  el: HTMLElement;
  rgb: [number, number, number];
  area: number;
  box: DOMRect;
}

function inkSurfaces(doc: Document): InkSurface[] {
  const surfaces: InkSurface[] = [];
  const body = doc.body;
  if (!body) return surfaces;
  for (const el of body.querySelectorAll<HTMLElement>("*")) {
    if (el.closest("svg")) continue;
    const rgb = opaqueRgb(getComputedStyle(el).backgroundColor);
    if (!rgb) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) continue;
    surfaces.push({ el, rgb, area: box.width * box.height, box });
  }
  return surfaces;
}

function paperBehind(el: HTMLElement, surfaces: readonly InkSurface[]): [number, number, number] {
  const own = opaqueRgb(getComputedStyle(el).backgroundColor);
  if (own) return own;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + Math.min(rect.height / 2, 16);
  let paper: [number, number, number] | null = null;
  let area = Number.POSITIVE_INFINITY;
  for (const surface of surfaces) {
    if (surface.el === el || surface.area >= area) continue;
    const box = surface.box;
    if (cx < box.left || cx > box.right || cy < box.top || cy > box.bottom) continue;
    paper = surface.rgb;
    area = surface.area;
  }
  return paper ?? [247, 244, 238];
}

function paintReadableInk(doc: Document): void {
  const body = doc.body;
  if (!body) return;
  // 代码块的深色底和文字经常不是同一个元素。只看文字自己的背景，会拿整页浅底来比，深色字就留在深色块上。
  const surfaces = inkSurfaces(doc);
  const texts = [...body.querySelectorAll<HTMLElement>("*")].filter((el) => {
    if (el.closest("svg") || el.tagName === "STYLE" || el.tagName === "SCRIPT") return false;
    return [...el.childNodes].some((node) => node.nodeType === 3 && (node.textContent || "").trim());
  });
  for (const el of texts) {
    if (!el.style) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const paper = paperBehind(el, surfaces);
    const ink = parsedRgb(getComputedStyle(el).color);
    const dark = luminance(paper) <= 0.42;
    const inkRgb: [number, number, number] | null = ink ? [ink[0], ink[1], ink[2]] : null;
    const weak = !inkRgb
      || !ink
      || ink[3] < 0.2
      || contrast(inkRgb, paper) < 4.5
      || (dark && luminance(inkRgb) < 0.75);
    if (!weak) continue;
    const next = dark ? "#f7f4ef" : "#1c1917";
    el.style.setProperty("color", next, "important");
    el.style.setProperty("-webkit-text-fill-color", next, "important");
  }
}

export function presentSlide(doc: Document): void {
  if (!doc.documentElement) return;
  try {
    presentSlideDocument(doc);
  } catch {
    // 预览修正失败时保留原页，不能把创作面板打崩。
  }
}

function presentSlideDocument(doc: Document): void {
  const root = doc.documentElement;
  if (!root) return;
  const section = [...doc.querySelectorAll<HTMLElement>("[data-pptx-slide]")].find((el) => !el.hidden);
  if (section && section.dataset.previewFit !== "1") {
    const top = section.getBoundingClientRect().top - root.getBoundingClientRect().top;
    if (Math.abs(top) > 1 && section.style) section.style.marginTop = `${-top}px`;
    section.dataset.previewFit = "1";
  }
  const bounds = section?.getBoundingClientRect();
  const texts = [...doc.querySelectorAll<HTMLElement>(TEXT_SELECTOR)].filter((el) => (el.innerText || "").trim());
  for (const el of texts) {
    if (!el.style) continue;
    const computed = getComputedStyle(el);
    if (computed.position === "static") el.style.position = "relative";
    el.style.zIndex = "8";
    if (Number(computed.opacity) < 0.15) el.style.opacity = "1";
    if (!bounds) continue;
    const rect = el.getBoundingClientRect();
    const outside = rect.width < 2
      || rect.height < 2
      || rect.bottom < bounds.top + 4
      || rect.top > bounds.bottom - 4
      || rect.right < bounds.left + 4
      || rect.left > bounds.right - 4;
    if (outside && computed.transform !== "none") el.style.transform = "none";
    if (el.getBoundingClientRect().width < 2) el.style.width = "880px";
  }
  paintReadableInk(doc);
}
