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
