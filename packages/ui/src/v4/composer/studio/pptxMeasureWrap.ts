/** 测量一行末尾掉下去的几个字，供写入 PPT 前加宽文本框。 */
export function measureWrap(
  el: HTMLElement,
  fontPx: number,
  contentLeft: number,
  contentRight: number,
): { widenPx: number; unwrapLines: number } {
  let range: Range;
  try {
    range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
  } catch {
    return { widenPx: 0, unwrapLines: 0 };
  }
  const merged: { top: number; left: number; right: number; w: number; h: number }[] = [];
  for (const rect of range.getClientRects()) {
    if (rect.width < 0.5 || rect.height < 0.5) continue;
    let hit: (typeof merged)[number] | undefined;
    for (const line of merged) {
      const mid = rect.top + rect.height / 2;
      if (Math.abs(line.top + line.h / 2 - mid) < Math.max(2, rect.height * 0.45)) {
        hit = line;
        break;
      }
    }
    if (hit) {
      hit.left = Math.min(hit.left, rect.left);
      hit.right = Math.max(hit.right, rect.right);
      hit.w = hit.right - hit.left;
      hit.h = Math.max(hit.h, rect.height);
    } else {
      merged.push({ top: rect.top, left: rect.left, right: rect.right, w: rect.width, h: rect.height });
    }
  }
  const contentW = Math.max(1, contentRight - contentLeft);
  let widenPx = 0;
  let unwrapLines = 0;
  for (let i = 1; i < merged.length; i += 1) {
    const prev = merged[i - 1];
    const cur = merged[i];
    if (!prev || !cur) continue;
    const prevFilled = prev.right >= contentRight - fontPx * 1.15;
    const shortTail = cur.w <= fontPx * 4.5 && cur.w < prev.w * 0.5;
    if (prevFilled && shortTail) {
      widenPx = Math.max(widenPx, cur.w + fontPx * 0.4);
      unwrapLines += 1;
    }
  }
  if (merged.length === 1 && merged[0] && merged[0].w >= contentW - 1.5) {
    widenPx = Math.max(widenPx, Math.max(8, fontPx * 0.85));
  }
  return { widenPx: Math.round(widenPx), unwrapLines };
}

const SLIDE_W = 1280;
const SLIDE_H = 720;

/** 边框高度为 0 时字仍可能画出来。用字形矩形，保存位置才能和预览一致。 */
export function elementBox(el: HTMLElement, root: HTMLElement): { x: number; y: number; w: number; h: number } | null {
  const rootRect = root.getBoundingClientRect();
  const boxes: DOMRect[] = [];
  const own = el.getBoundingClientRect();
  if (own.width >= 0.5 && own.height >= 0.5) boxes.push(own);
  if (boxes.length === 0) {
    try {
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      for (const rect of range.getClientRects()) {
        if (rect.width >= 0.5 && rect.height >= 0.5) boxes.push(rect);
      }
    } catch {
      return null;
    }
  }
  if (boxes.length === 0) return null;
  let left = boxes[0]?.left ?? 0;
  let top = boxes[0]?.top ?? 0;
  let right = boxes[0]?.right ?? 0;
  let bottom = boxes[0]?.bottom ?? 0;
  for (const rect of boxes) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  let x = left - rootRect.left;
  let y = top - rootRect.top;
  let w = right - left;
  let h = bottom - top;
  if (x + w < 0 || y + h < 0 || x > SLIDE_W || y > SLIDE_H) return null;
  x = Math.max(0, x);
  y = Math.max(0, y);
  w = Math.min(w, SLIDE_W - x);
  h = Math.min(h, SLIDE_H - y);
  return w >= 0.5 && h >= 0.5 ? { x, y, w, h } : null;
}
