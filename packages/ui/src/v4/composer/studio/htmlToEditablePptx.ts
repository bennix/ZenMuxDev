import { parseColor, cssBorders } from "./pptxCssShape.js";
/**
 * 把分页 HTML 测成文字、形状和图片，再写成其他软件能打开的 PPTX。
 * 坐标换算和对象类型跟 GenOffice 的 html-to-editable-pptx 一致：16:9，13.333×7.5 英寸。
 */
import { presentSlide } from "./deckPreview.js";
import { showSlide, waitForSlideDocument } from "./deckSlides.js";
import { elementBox, measureWrap } from "./pptxMeasureWrap.js";
import { rasterizeSvgImages, svgSnapshot } from "./pptxSvgImage.js";
import { measuredTextLines, resolvePptxFontFace } from "./pptxTextLines.js";
import { prepareDeckHtml } from "./deckHtmlOps.js";

export {
  deckSectionHtml,
  describeElements,
  parseElementEdits,
  prepareDeckHtml,
  replaceDeckElements,
  stripDeckHtml,
} from "./deckHtmlOps.js";
export type { ElementEdit } from "./deckHtmlOps.js";
export { buildEditableDeckPptx } from "./pptxWriter.js";

export interface EditableHtmlTextRun {
  text: string;
  fontFace: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  /** CSS pixel size; converted to points only at the PPTX boundary. */
  fontSize?: number;
}

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
  textRuns?: EditableHtmlTextRun[];
  bullet?: boolean;
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

const SLIDE_W = 1280;
const SLIDE_H = 720;
const BLOCK_TEXT_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "TD",
  "TH",
  "BLOCKQUOTE",
  "FIGCAPTION",
  "LABEL",
]);
const INLINE_TEXT_TAGS = new Set(["SPAN", "STRONG", "EM", "SMALL"]);

function hasBlockTextAncestor(el: HTMLElement, root: HTMLElement): boolean {
  for (let parent = el.parentElement; parent && parent !== root; parent = parent.parentElement) {
    if (el.tagName === "LI" && parent.tagName === "LI") continue;
    if (BLOCK_TEXT_TAGS.has(parent.tagName)) return true;
    if (parent.dataset.pptxKind === "text" && !hasBlockTextDescendant(parent)) return true;
  }
  return false;
}

function hasBlockTextDescendant(el: HTMLElement): boolean {
  return (
    [...el.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption,label")].length > 0
  );
}

function textGroupOwner(
  el: HTMLElement,
  root: HTMLElement,
  kind: string | null,
  direct: string,
): boolean {
  if (hasBlockTextAncestor(el, root)) return false;
  if (BLOCK_TEXT_TAGS.has(el.tagName)) return true;
  if (kind === "text") return !hasBlockTextDescendant(el);
  if (INLINE_TEXT_TAGS.has(el.tagName)) return true;
  return Boolean(direct) && kind !== "image";
}

function measureRoot(root: HTMLElement): EditableHtmlPage {
  const rootRect = root.getBoundingClientRect();
  const style = getComputedStyle(root);
  const background = parseColor(style.backgroundColor);
  const elements = [...root.querySelectorAll<HTMLElement>("*")];
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
        x,
        y,
        w,
        h,
        src: svgSnapshot(el, w, h),
        objectFit: "contain",
        zIndex: computed.zIndex === "auto" ? undefined : Number(computed.zIndex),
      });
      continue;
    }
    // iframe 的 HTMLElement 构造器属于另一个 realm，不能用父窗口 instanceof 判断。
    if (el.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
    const computed = getComputedStyle(el);
    if (
      computed.display === "none" ||
      computed.visibility === "hidden" ||
      Number(computed.opacity) === 0
    )
      continue;
    const placed = elementBox(el, root);
    if (!placed) continue;
    const { x, y, w, h } = placed;
    const kind = el.getAttribute("data-pptx-kind");
    const fill = parseColor(computed.backgroundColor);
    const line = parseColor(computed.borderTopColor);
    const lineWidth = Number.parseFloat(computed.borderTopWidth) || 0;
    const zIndex = computed.zIndex === "auto" ? undefined : Number(computed.zIndex);
    const { triangle, uniformBorder, visibleEdges } = cssBorders(computed, { x, y, w, h }, zIndex);
    if (triangle) {
      nodes.push(triangle);
      continue;
    }
    const shape =
      kind === "shape" || Boolean(fill && fill.transparency < 99) || visibleEdges.length > 0;
    if (shape) {
      nodes.push({
        kind: "shape",
        x,
        y,
        w,
        h,
        fill: fill?.hex,
        fillTransparency: fill?.transparency,
        lineColor: uniformBorder && lineWidth > 0 ? line?.hex : undefined,
        lineWidth: uniformBorder ? lineWidth : 0,
        radius: Number.parseFloat(computed.borderTopLeftRadius) || 0,
        zIndex,
      });
    }
    if (!uniformBorder)
      for (const edge of visibleEdges) {
        const horizontal = edge.index === 0 || edge.index === 2;
        nodes.push({
          kind: "shape",
          x: x + (edge.index === 1 ? w - edge.width : 0),
          y: y + (edge.index === 2 ? h - edge.width : 0),
          w: horizontal ? w : edge.width,
          h: horizontal ? edge.width : h,
          fill: edge.color!.hex,
          fillTransparency: edge.color!.transparency,
          zIndex,
        });
      }
    if ((kind === "image" || !kind) && el.tagName === "IMG") {
      const image = el as HTMLImageElement;
      const fit = computed.objectFit;
      nodes.push({
        kind: "image",
        x,
        y,
        w,
        h,
        src: image.currentSrc || image.src,
        objectFit: fit === "cover" || fit === "contain" || fit === "fill" ? fit : "fill",
        zIndex,
      });
      continue;
    }
    const text = (el.innerText || el.textContent || "").replace(/[ \t]+\n/gu, "\n").trim();
    const direct = [...el.childNodes]
      .reduce((sum, node) => sum + (node.nodeType === 3 ? node.textContent || "" : ""), "")
      .trim();
    const isText =
      el.tagName !== "STYLE" &&
      el.tagName !== "SCRIPT" &&
      kind !== "image" &&
      Boolean(text) &&
      textGroupOwner(el, root, kind, direct);
    if (!isText || !text) continue;
    const color = parseColor(computed.color);
    const weight = Number(computed.fontWeight) || (computed.fontWeight === "bold" ? 700 : 400);
    const align =
      computed.textAlign === "center"
        ? "center"
        : computed.textAlign === "right" || computed.textAlign === "end"
          ? "right"
          : "left";
    const fontPx = Number.parseFloat(computed.fontSize) || 18;
    const padL = Number.parseFloat(computed.paddingLeft) || 0;
    const padR = Number.parseFloat(computed.paddingRight) || 0;
    const box = el.getBoundingClientRect();
    const contentLeft = box.left + (Number.parseFloat(computed.borderLeftWidth) || 0) + padL;
    const contentRight = box.right - (Number.parseFloat(computed.borderRightWidth) || 0) - padR;
    const wrap = measureWrap(el, fontPx, contentLeft, contentRight);
    const lineHeight = Number.parseFloat(computed.lineHeight);
    const fontFamily = resolvePptxFontFace(computed.fontFamily, text);
    // 4% 余量仅加到浏览器测量的文本框；适配器仍会按邻近对象与页边界限制实际扩宽。
    const widthSlack = Math.min(w * 0.04, Math.max(0, SLIDE_W - x - w));
    nodes.push(
      ...measuredTextLines(el, root, {
        kind: "text",
        x,
        y,
        w,
        h,
        text,
        color: color?.hex,
        fontFace: fontFamily,
        fontSize: fontPx,
        bold: weight >= 600,
        italic: computed.fontStyle === "italic",
        bullet: el.tagName === "LI",
        align,
        valign:
          computed.display.includes("flex") && computed.alignItems === "center" ? "middle" : "top",
        lineHeight: Number.isFinite(lineHeight) ? lineHeight : undefined,
        widenPx:
          Math.max(wrap.widenPx, widthSlack) > 0 ? Math.max(wrap.widenPx, widthSlack) : undefined,
        unwrapLines: wrap.unwrapLines > 0 ? wrap.unwrapLines : undefined,
        zIndex,
      }),
    );
  }
  return {
    width: SLIDE_W,
    height: SLIDE_H,
    background: background && background.transparency < 100 ? background.hex : "FFFFFF",
    nodes: orderNodes(nodes),
  };
}

function orderNodes(nodes: EditableHtmlNode[]): EditableHtmlNode[] {
  const layer = (node: EditableHtmlNode) => (Number.isFinite(node.zIndex) ? (node.zIndex ?? 0) : 0);
  const sorted = [...nodes].sort((a, b) => layer(a) - layer(b));
  const result: EditableHtmlNode[] = [];
  const emitted = new Set<EditableHtmlNode>();
  const contains = (back: EditableHtmlNode, front: EditableHtmlNode) => {
    if (back.kind !== "shape" || !back.fill || (back.fillTransparency ?? 0) >= 99) return false;
    if (layer(back) !== layer(front)) return false;
    const larger = back.w * back.h > front.w * front.h;
    if (!larger && !(front.kind === "text" && back.w === front.w && back.h === front.h))
      return false;
    return (
      back.x <= front.x + 1 &&
      back.y <= front.y + 1 &&
      back.x + back.w >= front.x + front.w - 1 &&
      back.y + back.h >= front.y + front.h - 1
    );
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
  iframe.style.cssText =
    "position:fixed;left:-16000px;top:0;width:1280px;height:720px;border:0;pointer-events:none";
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
      const visible = [...doc.querySelectorAll<HTMLElement>("[data-pptx-slide]")].find(
        (el) => !el.hasAttribute("hidden"),
      );
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
