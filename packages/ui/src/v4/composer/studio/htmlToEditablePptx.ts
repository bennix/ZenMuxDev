import {parseColor,cssBorders} from "./pptxCssShape.js";
/**
 * 把分页 HTML 测成文字、形状和图片，再写成其他软件能打开的 PPTX。
 * 坐标换算和对象类型跟 GenOffice 的 html-to-editable-pptx 一致：16:9，13.333×7.5 英寸。
 */
import PptxGenJS from "pptxgenjs";
import { presentSlide } from "./deckPreview.js";
import { showSlide, stampDeck, stripDeckNoise, topSlides, waitForSlideDocument } from "./deckSlides.js";
import { elementBox, measureWrap } from "./pptxMeasureWrap.js";
import { rasterizeSvgImages, svgSnapshot } from "./pptxSvgImage.js";
import { measuredTextLines } from "./pptxTextLines.js";

export interface EditableHtmlNode {
  kind: "shape" | "text" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  fillTransparency?: number;
  lineColor?: string;
  lineWidth?: number;
  radius?: number;
  triangleRotation?: number;
  noWrap?: boolean;
  text?: string;
  color?: string;
  fontFace?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  src?: string;
  objectFit?: "cover" | "contain" | "fill";
  lineHeight?: number;
  widenPx?: number;
  unwrapLines?: number;
  zIndex?: number;
}

export interface EditableHtmlPage {
  width: number;
  height: number;
  background?: string;
  nodes: EditableHtmlNode[];
}

export interface ElementEdit {
  id: string;
  html: string;
}

const SLIDE_W = 1280;
const SLIDE_H = 720;

export function stripDeckHtml(raw: string): string {
  return raw.replace(/^```html\s*/iu, "").replace(/```$/u, "").trim();
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
      do { id = `el-${next++}`; } while (usedIds.has(id) || doc.querySelector(`[data-pptx-id="${id}"]`));
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
    return typeof record.id === "string" && record.id && typeof record.html === "string" && record.html
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


function measureRoot(root: HTMLElement): EditableHtmlPage {
  const rootRect = root.getBoundingClientRect();
  const style = getComputedStyle(root);
  const background = parseColor(style.backgroundColor);
  const elements = [...root.querySelectorAll<HTMLElement>("*")];
  const semantic = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "TD", "TH", "BLOCKQUOTE", "FIGCAPTION", "LABEL", "SPAN", "STRONG", "EM", "SMALL"]);
  const nodes: EditableHtmlNode[] = [];
  for (const el of elements) {
    if (nodes.length >= 500) break;
    const ownerSvg = el.closest("svg");
    if (ownerSvg && ownerSvg !== (el as Element)) continue;
    if (el.tagName.toLowerCase() === "svg") {
      const rect = el.getBoundingClientRect();
      const x = rect.left - rootRect.left;
      const y = rect.top - rootRect.top;
      const w = rect.width;
      const h = rect.height;
      if (w < 0.5 || h < 0.5) continue;
      const computed = getComputedStyle(el);
      nodes.push({
        kind: "image",
        x, y, w, h,
        src: svgSnapshot(el, w, h),
        objectFit: "contain",
        zIndex: computed.zIndex === "auto" ? undefined : Number(computed.zIndex),
      });
      continue;
    }
    // iframe 的 HTMLElement 构造器属于另一个 realm，不能用父窗口 instanceof 判断。
    if (el.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
    const computed = getComputedStyle(el);
    if (computed.display === "none" || computed.visibility === "hidden" || Number(computed.opacity) === 0) continue;
    const placed = elementBox(el, root);
    if (!placed) continue;
    const { x, y, w, h } = placed;
    const kind = el.getAttribute("data-pptx-kind");
    const fill = parseColor(computed.backgroundColor);
    const line = parseColor(computed.borderTopColor);
    const lineWidth = Number.parseFloat(computed.borderTopWidth) || 0;
    const zIndex = computed.zIndex === "auto" ? undefined : Number(computed.zIndex);
    const {triangle,uniformBorder,visibleEdges}=cssBorders(computed,{x,y,w,h},zIndex);
    if(triangle){nodes.push(triangle);continue;}
    const shape = kind === "shape" || Boolean(fill && fill.transparency < 99) || visibleEdges.length > 0;
    if (shape) {
      nodes.push({
        kind: "shape",
        x, y, w, h,
        fill: fill?.hex,
        fillTransparency: fill?.transparency,
        lineColor: uniformBorder && lineWidth > 0 ? line?.hex : undefined,
        lineWidth: uniformBorder ? lineWidth : 0,
        radius: Number.parseFloat(computed.borderTopLeftRadius) || 0,
        zIndex,
      });
    }
    if (!uniformBorder) for (const edge of visibleEdges) {
      const horizontal=edge.index===0 || edge.index===2;
      nodes.push({kind:"shape",x:x+(edge.index===1?w-edge.width:0),y:y+(edge.index===2?h-edge.width:0),w:horizontal?w:edge.width,h:horizontal?edge.width:h,fill:edge.color!.hex,fillTransparency:edge.color!.transparency,zIndex});
    }
    if ((kind === "image" || !kind) && el.tagName === "IMG") {
      const image = el as HTMLImageElement;
      const fit = computed.objectFit;
      nodes.push({
        kind: "image",
        x, y, w, h,
        src: image.currentSrc || image.src,
        objectFit: fit === "cover" || fit === "contain" || fit === "fill" ? fit : "fill",
        zIndex,
      });
      continue;
    }
    const text = (el.innerText || el.textContent || "").replace(/[ \t]+\n/gu, "\n").trim();
    const childText = [...el.children].some((child) => semantic.has(child.tagName) && (child.textContent || "").trim());
    const direct = [...el.childNodes].reduce((sum, node) => sum + (node.nodeType === 3 ? node.textContent || "" : ""), "").trim();
    const leaf = ![...el.children].some((child) => (child.textContent || "").trim());
    const isText = leaf && el.tagName !== "STYLE" && el.tagName !== "SCRIPT" && kind !== "image" && (
      kind === "text" || Boolean(direct) || (!kind && Boolean(text) && !childText)
    );
    if (!isText || !text) continue;
    const color = parseColor(computed.color);
    const weight = Number(computed.fontWeight) || (computed.fontWeight === "bold" ? 700 : 400);
    const align = computed.textAlign === "center" ? "center" : computed.textAlign === "right" || computed.textAlign === "end" ? "right" : "left";
    const fontPx = Number.parseFloat(computed.fontSize) || 18;
    const padL = Number.parseFloat(computed.paddingLeft) || 0;
    const padR = Number.parseFloat(computed.paddingRight) || 0;
    const box = el.getBoundingClientRect();
    const contentLeft = box.left + (Number.parseFloat(computed.borderLeftWidth) || 0) + padL;
    const contentRight = box.right - (Number.parseFloat(computed.borderRightWidth) || 0) - padR;
    const wrap = measureWrap(el, fontPx, contentLeft, contentRight);
    const lineHeight = Number.parseFloat(computed.lineHeight);
    nodes.push(...measuredTextLines(el, root, {
      kind: "text",
      x,
      y,
      w,
      h,
      text: el.tagName === "LI" && !text.startsWith("•") ? `• ${text}` : text,
      color: color?.hex,
      fontFace: computed.fontFamily.split(",")[0]?.replace(/["']/gu, "").trim() || "Arial",
      fontSize: fontPx,
      bold: weight >= 600,
      italic: computed.fontStyle === "italic",
      align, valign: computed.display.includes("flex") && computed.alignItems === "center" ? "middle" : "top",
      lineHeight: Number.isFinite(lineHeight) ? lineHeight : undefined,
      widenPx: wrap.widenPx > 0 ? wrap.widenPx : undefined,
      unwrapLines: wrap.unwrapLines > 0 ? wrap.unwrapLines : undefined,
      zIndex,
    }));
  }
  return {
    width: SLIDE_W,
    height: SLIDE_H,
    background: background && background.transparency < 100 ? background.hex : "FFFFFF",
    nodes: orderNodes(nodes),
  };
}

function orderNodes(nodes: EditableHtmlNode[]): EditableHtmlNode[] {
  const layer = (node: EditableHtmlNode) => (Number.isFinite(node.zIndex) ? node.zIndex ?? 0 : 0);
  const sorted = [...nodes].sort((a, b) => layer(a) - layer(b));
  const result: EditableHtmlNode[] = [];
  const emitted = new Set<EditableHtmlNode>();
  const contains = (back: EditableHtmlNode, front: EditableHtmlNode) => {
    if (back.kind !== "shape" || !back.fill || (back.fillTransparency ?? 0) >= 99) return false;
    if (layer(back) !== layer(front)) return false;
    const larger = back.w * back.h > front.w * front.h;
    if (!larger && !(front.kind === "text" && back.w === front.w && back.h === front.h)) return false;
    return back.x <= front.x + 1 && back.y <= front.y + 1 && back.x + back.w >= front.x + front.w - 1 && back.y + back.h >= front.y + front.h - 1;
  };
  const emit = (node: EditableHtmlNode) => {
    if (emitted.has(node)) return;
    emitted.add(node);
    for (const background of sorted) {
      if (background !== node && contains(background, node)) emit(background);
    }
    result.push(node);
  };
  for (const node of sorted) emit(node);
  return result;
}

export async function measureDeckHtml(html: string): Promise<EditableHtmlPage[]> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.style.cssText = "position:fixed;left:-16000px;top:0;width:1280px;height:720px;border:0;pointer-events:none";
  // about:blank 的 load 会先到。那时正文还没解析，测量结果是空的，保存就会误报没有可编辑文字。
  await waitForSlideDocument(iframe, prepareDeckHtml(html));
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("无法测量幻灯片");
    await doc.fonts?.ready;
    // 和预览一样一次只显示一页，按这一页的真实坐标测量，避免整页被收成一列文字。
    const total = Math.max(1, showSlide(doc, 0));
    const pages: EditableHtmlPage[] = [];
    for (let index = 0; index < total; index += 1) {
      showSlide(doc, index);
      presentSlide(doc);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const visible = [...doc.querySelectorAll<HTMLElement>("[data-pptx-slide]")].find((el) => !el.hasAttribute("hidden"));
      pages.push(measureRoot(visible ?? doc.body));
    }
    for (const page of pages) await rasterizeSvgImages(page.nodes);
    return pages;
  } finally {
    iframe.remove();
  }
}

export async function measureDeckPages(pages: readonly string[]): Promise<EditableHtmlPage[]> {
  const measured: EditableHtmlPage[] = [];
  for (const page of pages) {
    const batch = await measureDeckHtml(page);
    const first = batch[0];
    if (first) measured.push(first);
  }
  return measured;
}

function asHex(value: string | undefined, fallback: string): string {
  const match = value?.replace("#", "").match(/^[0-9a-f]{6}$/iu);
  return match ? match[0].toUpperCase() : fallback;
}

async function loadImage(src: string): Promise<string | null> {
  if (src.startsWith("data:image/")) return src;
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    const data = await blob.arrayBuffer();
    const bytes = new Uint8Array(data);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${blob.type};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

interface PptxSlide {
  background: { color: string };
  addShape(kind: string, options: object): void;
  addText(text: string, options: object): void;
  addImage(options: object): void;
}

interface PptxDeck {
  defineLayout(layout: { name: string; width: number; height: number }): void;
  layout: string;
  author: string;
  subject: string;
  ShapeType: { rect: string; roundRect: string; triangle: string };
  addSlide(): PptxSlide;
  write(options: { outputType: "uint8array" }): Promise<Uint8Array | ArrayBuffer>;
}

export async function buildEditableDeckPptx(pages: readonly EditableHtmlPage[]): Promise<Uint8Array> {
  const pptx = new (PptxGenJS as unknown as new () => PptxDeck)();
  pptx.defineLayout({ name: "ZEN_WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "ZEN_WIDE";
  pptx.author = "ZenCode";
  pptx.subject = "Editable PowerPoint";
  for (const page of pages) {
    const slide = pptx.addSlide();
    slide.background = { color: asHex(page.background, "FFFFFF") };
    const width = Math.max(1, page.width || SLIDE_W);
    const height = Math.max(1, page.height || SLIDE_H);
    const sx = 13.333 / width;
    const sy = 7.5 / height;
    for (const node of page.nodes) {
      const x = Math.min(Math.max(node.x, 0), width) * sx;
      const y = Math.min(Math.max(node.y, 0), height) * sy;
      const w = Math.max(0, Math.min(node.w, width - node.x)) * sx;
      const h = Math.max(0, Math.min(node.h, height - node.y)) * sy;
      if (w < 0.01 || h < 0.01) continue;
      if (node.kind === "shape") {
        const hasLine = Boolean(node.lineColor && (node.lineWidth ?? 0) > 0);
        slide.addShape(node.triangleRotation !== undefined ? pptx.ShapeType.triangle : node.radius && node.radius > 2 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
          rotate: node.triangleRotation,
          x: node.triangleRotation === 90 || node.triangleRotation === 270 ? x+(w-h)/2 : x,
          y: node.triangleRotation === 90 || node.triangleRotation === 270 ? y+(h-w)/2 : y,
          w: node.triangleRotation === 90 || node.triangleRotation === 270 ? h : w,
          h: node.triangleRotation === 90 || node.triangleRotation === 270 ? w : h,
          fill: node.fill ? { color: asHex(node.fill, "FFFFFF"), transparency: node.fillTransparency ?? 0 } : { color: "FFFFFF", transparency: 100 },
          line: hasLine ? { color: asHex(node.lineColor, "000000"), width: Math.max(0.25, (node.lineWidth ?? 1) * 0.75) } : { color: "FFFFFF", transparency: 100 },
          rectRadius: node.radius ? Math.min(1, (node.radius * sx) / Math.min(w, h)) : 0,
        });
      } else if (node.kind === "text" && node.text?.trim()) {
        slide.addText(node.text.trim(), {
          x, y, w, h,
          margin: 0,
          wrap: !node.noWrap,
          lang: "zh-CN",
          isTextBox: true,
          color: asHex(node.color, "1A1A1A"),
          fontFace: node.fontFace || "Arial",
          fontSize: Math.min(72, Math.max(6, (node.fontSize || 18) * 0.75)),
          bold: node.bold,
          italic: node.italic,
          align: node.align ?? "left",
          valign: node.valign ?? "top",
          lineSpacing: node.lineHeight ? Math.max(8, node.lineHeight * 0.75) : undefined,
        });
      } else if (node.kind === "image" && node.src) {
        const data = await loadImage(node.src);
        if (!data) continue;
        slide.addImage({
          data, x, y, w, h,
          sizing: node.objectFit === "cover" || node.objectFit === "contain" ? { type: node.objectFit, w, h } : undefined,
        });
      }
    }
  }
  const bytes = await pptx.write({ outputType: "uint8array" });
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer);
}
