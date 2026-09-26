import type { EditableHtmlNode } from "./htmlToEditablePptx.js";

const FIT_GAP = 8;
/** 正文测量字号低于这个值就不再缩小，避免为了塞进色块把字缩糊。 */
const BODY_FLOOR = 24;

function overlapLen(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function isDecorShape(node: EditableHtmlNode): boolean {
  if (node.kind !== "shape") return false;
  if (node.h < 12 || node.w < 12) return false;
  const filled = Boolean(node.fill) && (node.fillTransparency ?? 0) < 92;
  const stroked = Boolean(node.lineColor) && (node.lineWidth ?? 0) > 0;
  return filled || stroked;
}

function isBackdrop(node: EditableHtmlNode, pageWidth: number, pageHeight: number): boolean {
  return node.w * node.h >= pageWidth * pageHeight * 0.7;
}

function pickContainer(
  text: EditableHtmlNode,
  shapes: EditableHtmlNode[],
  pageWidth: number,
  pageHeight: number,
): EditableHtmlNode | undefined {
  let best: EditableHtmlNode | undefined;
  let bestArea = Infinity;
  const font = text.fontSize || 18;
  for (const shape of shapes) {
    if (isBackdrop(shape, pageWidth, pageHeight)) continue;
    const xOverlap = overlapLen(text.x, text.x + text.w, shape.x, shape.x + shape.w);
    if (xOverlap < Math.min(text.w, shape.w) * 0.55) continue;
    const yOverlap = overlapLen(text.y, text.y + text.h, shape.y, shape.y + shape.h);
    const mostlyInside = yOverlap > text.h * 0.4;
    const spilling = yOverlap > 0 && text.y <= shape.y + shape.h + Math.min(12, font * 0.4) && text.y >= shape.y - 8;
    if (!mostlyInside && !spilling) continue;
    if (shape.w + 4 < text.w * 0.7) continue;
    const area = shape.w * shape.h;
    if (area < bestArea) {
      best = shape;
      bestArea = area;
    }
  }
  return best;
}

function edgeLimit(
  node: EditableHtmlNode,
  nodes: EditableHtmlNode[],
  ignore: Set<EditableHtmlNode>,
  pageWidth: number,
  pageHeight: number,
  side: "left" | "right",
): number {
  let limit = side === "right" ? pageWidth - 12 : 12;
  for (const other of nodes) {
    if (other === node || ignore.has(other)) continue;
    if (isBackdrop(other, pageWidth, pageHeight)) continue;
    const yOverlap = overlapLen(node.y, node.y + node.h, other.y, other.y + other.h);
    if (yOverlap < 6) continue;
    if (side === "right" && other.x >= node.x + node.w - 2) limit = Math.min(limit, other.x - FIT_GAP);
    if (side === "left" && other.x + other.w <= node.x + 2) limit = Math.max(limit, other.x + other.w + FIT_GAP);
  }
  return limit;
}

function fontFloor(font: number): number {
  return font >= BODY_FLOOR ? BODY_FLOOR : font;
}

/**
 * PowerPoint 会按比浏览器更窄的宽度再折行。末尾几个字单独成行时加宽文本框；
 * 加宽被挡住时也不要把正文缩到看不清。文字超出色块时加宽、加高色块把它包住。
 */
export function fitTextInsideDecorations(
  nodes: readonly EditableHtmlNode[],
  pageWidth: number,
  pageHeight: number,
): EditableHtmlNode[] {
  const fitted = nodes.map((node) => ({ ...node }));
  const texts = fitted.filter((node) => node.kind === "text" && node.text?.trim());
  const shapes = fitted.filter(isDecorShape);
  const containerOf = new Map<EditableHtmlNode, EditableHtmlNode | undefined>();
  const padOf = new Map<EditableHtmlNode, { l: number; r: number; t: number; b: number }>();
  for (const text of texts) containerOf.set(text, pickContainer(text, shapes, pageWidth, pageHeight));
  for (const shape of shapes) {
    if (isBackdrop(shape, pageWidth, pageHeight)) continue;
    const members = texts.filter((text) => containerOf.get(text) === shape);
    if (members.length === 0) continue;
    const contentLeft = Math.min(...members.map((text) => text.x));
    const contentRight = Math.max(...members.map((text) => text.x + text.w));
    const contentTop = Math.min(...members.map((text) => text.y));
    const contentBottom = Math.max(...members.map((text) => text.y + text.h));
    padOf.set(shape, {
      l: Math.max(8, contentLeft - shape.x),
      r: Math.max(8, shape.x + shape.w - contentRight),
      t: Math.max(6, contentTop - shape.y),
      b: Math.max(8, shape.y + shape.h - contentBottom),
    });
  }

  const readingOrder = [...texts].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const text of readingOrder) {
    const widen = text.widenPx ?? 0;
    const unwrap = text.unwrapLines ?? 0;
    if (widen <= 0) continue;
    const font = text.fontSize || 18;
    const container = containerOf.get(text);
    const ignore = new Set<EditableHtmlNode>([text]);
    if (container) ignore.add(container);
    const right = edgeLimit(text, fitted, ignore, pageWidth, pageHeight, "right");
    const left = edgeLimit(text, fitted, ignore, pageWidth, pageHeight, "left");
    let grow = Math.max(0, Math.min(widen, right - (text.x + text.w)));
    if (text.align === "right") {
      grow = Math.min(grow, text.x - left);
      text.x -= grow;
      text.w += grow;
    } else if (text.align === "center") {
      const leftGrow = Math.min(grow / 2, text.x - left);
      const rightGrow = Math.min(grow - leftGrow, right - (text.x + text.w));
      text.x -= leftGrow;
      text.w += leftGrow + rightGrow;
      grow = leftGrow + rightGrow;
    } else {
      text.w += grow;
    }
    const room = text.w;
    const needed = text.w - grow + widen;
    const floor = fontFloor(font);
    let scale = 1;
    if (unwrap > 0 && room + 1 < needed && font > floor) {
      scale = Math.max(floor / font, room / needed);
      text.fontSize = Math.round(font * scale * 10) / 10;
      if (text.lineHeight) text.lineHeight = Math.round(text.lineHeight * scale * 10) / 10;
    }
    const absorbed = unwrap > 0 && room + 1 >= needed * scale;
    if (!absorbed) continue;
    const lineH = text.lineHeight && text.lineHeight > font * 0.55 ? text.lineHeight / scale : font * 1.35;
    const drop = Math.min(lineH * unwrap, Math.max(0, text.h - lineH));
    if (drop < 1) continue;
    const oldBottom = text.y + text.h;
    text.h -= drop;
    const newBottom = text.y + text.h;
    for (const other of texts) {
      if (other === text || containerOf.get(other) !== container) continue;
      if (overlapLen(text.x, text.x + text.w, other.x, other.x + other.w) < 8) continue;
      if (other.y < oldBottom - 6) continue;
      other.y = Math.max(newBottom, other.y - drop);
    }
  }

  const orderedShapes = shapes
    .filter((shape) => !isBackdrop(shape, pageWidth, pageHeight) && padOf.has(shape))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const shape of orderedShapes) {
    const members = texts.filter((text) => containerOf.get(text) === shape);
    if (members.length === 0) continue;
    const pad = padOf.get(shape);
    if (!pad) continue;
    const contentRight = Math.max(...members.map((text) => text.x + text.w));
    const contentBottom = Math.max(...members.map((text) => text.y + text.h));
    const ignore = new Set<EditableHtmlNode>([shape, ...members]);
    const needRight = contentRight + pad.r;
    if (shape.x + shape.w + 1 < needRight) {
      const limit = edgeLimit(shape, fitted, ignore, pageWidth, pageHeight, "right");
      shape.w = Math.max(shape.w, Math.min(needRight, limit) - shape.x);
    }
    const targetBottom = contentBottom + pad.b;
    const overflow = targetBottom - (shape.y + shape.h);
    if (overflow > 3) {
      const blockers = fitted.filter((node) => {
        if (ignore.has(node) || isBackdrop(node, pageWidth, pageHeight)) return false;
        if (node.y < shape.y + shape.h - 4) return false;
        return overlapLen(shape.x, shape.x + shape.w, node.x, node.x + node.w) > 8;
      });
      const lowest = blockers.reduce((max, node) => Math.max(max, node.y + node.h), shape.y + shape.h);
      const roomBelow = pageHeight - 4 - lowest;
      const shift = Math.max(0, Math.min(overflow, roomBelow));
      if (shift > 0) {
        for (const node of blockers) node.y += shift;
        shape.h += shift;
      }
    }
    const contentBottomNow = Math.max(...members.map((text) => text.y + text.h));
    const needBottom = contentBottomNow + Math.min(pad.b, 16);
    if (shape.y + shape.h + 1 < needBottom) {
      shape.h = Math.max(shape.h, Math.min(needBottom, pageHeight - 4) - shape.y);
    }
  }

  return fitted;
}
