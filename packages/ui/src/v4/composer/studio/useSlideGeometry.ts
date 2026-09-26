import { prepareDeckHtml } from "./htmlToEditablePptx.js";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export interface GeometryEdit { id: string; properties: Record<string, string> }

export function applyDeckGeometry(html: string, edits: readonly GeometryEdit[]): string {
  const doc = new DOMParser().parseFromString(prepareDeckHtml(html), "text/html");
  for (const edit of edits) {
    const el = doc.querySelector<HTMLElement>(`[data-pptx-id="${CSS.escape(edit.id)}"]`);
    if (!el) continue;
    for (const [name, value] of Object.entries(edit.properties)) el.style.setProperty(name, value, "important");
  }
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

interface Item {
  el: HTMLElement; id: string; style: string | null;
  x: number; y: number; w: number; h: number;
  cssW: number; cssH: number; translate: string;
}
interface Gesture {
  items: Item[]; html: string; pointer: number; target: HTMLElement;
  startX: number; startY: number; scale: number; handle?: ResizeHandle;
  x: number; y: number; w: number; h: number; edits: GeometryEdit[];
}

export function useSlideGeometry(input: {
  html: string;
  disabled: boolean;
  document: () => Document | null;
  scale: () => number;
  refresh: () => void;
  commit: (source: string, edits: GeometryEdit[]) => void;
}) {
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef(input);
  latest.current = input;
  const cancel = () => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    for (const item of active.items) {
      if (item.style == null) item.el.removeAttribute("style");
      else item.el.setAttribute("style", item.style);
    }
    if (active.target.hasPointerCapture(active.pointer)) active.target.releasePointerCapture(active.pointer);
    latest.current.refresh();
  };
  useEffect(() => () => cancel(), [input.html, input.disabled]);

  const begin = (event: ReactPointerEvent<HTMLElement>, ids: readonly string[], handle?: ResizeHandle) => {
    if (input.disabled || event.button !== 0 || !event.isPrimary) return;
    const doc = input.document();
    if (!doc) return;
    cancel();
    const elements = ids.flatMap((id) => {
      const el = doc.querySelector<HTMLElement>(`[data-pptx-id="${CSS.escape(id)}"]`);
      return el ? [el] : [];
    });
    // 同时选中容器和子元素时只操作容器，否则子元素会被移动两次。
    const items = elements.filter(el => !elements.some(parent => parent !== el && parent.contains(el))).map(el => {
      const rect = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return { el, id: el.getAttribute("data-pptx-id")!, style: el.getAttribute("style"),
        x: rect.x, y: rect.y, w: rect.width, h: rect.height,
        cssW: Number.parseFloat(css.width) || rect.width,
        cssH: Number.parseFloat(css.height) || rect.height,
        translate: css.translate === "none" ? "0px 0px" : css.translate };
    });
    if (!items.length) return;
    const x = Math.min(...items.map(item => item.x));
    const y = Math.min(...items.map(item => item.y));
    const w = Math.max(...items.map(item => item.x + item.w)) - x;
    const h = Math.max(...items.map(item => item.y + item.h)) - y;
    gesture.current = {items, html: input.html, pointer:event.pointerId, target:event.currentTarget,
      startX:event.clientX, startY:event.clientY, scale:input.scale(), handle, x,y,w,h, edits:[]};
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointer) return;
    if (active.html !== latest.current.html || latest.current.disabled) { cancel(); return; }
    const dx = (event.clientX - active.startX) / active.scale;
    const dy = (event.clientY - active.startY) / active.scale;
    if (!active.edits.length && Math.hypot(dx, dy) * active.scale < 3) return;
    const {handle, x,y,w,h} = active;
    let nx = x, ny = y, nw = w, nh = h;
    if (!handle) { nx += dx; ny += dy; }
    else {
      const minW = Math.max(...active.items.map(item => 16 * w / Math.max(1,item.w)));
      const minH = Math.max(...active.items.map(item => 16 * h / Math.max(1,item.h)));
      if (handle.includes("e")) nw = Math.max(minW, w + dx);
      if (handle.includes("s")) nh = Math.max(minH, h + dy);
      if (handle.includes("w")) { nw = Math.max(minW, w - dx); nx = x + w - nw; }
      if (handle.includes("n")) { nh = Math.max(minH, h - dy); ny = y + h - nh; }
    }
    active.edits = active.items.map(item => {
      const tx = nx + (item.x-x)*nw/w - item.x;
      const ty = ny + (item.y-y)*nh/h - item.y;
      const [bx = "0px", by = "0px"] = item.translate.split(/\s+/u);
      const properties: Record<string,string> = {translate:`calc(${bx} + ${tx}px) calc(${by} + ${ty}px)`};
      // 普通 inline 文本不响应 translate/width；几何编辑时转为可变换盒子。
      if (getComputedStyle(item.el).display === "inline") properties.display = "inline-block";
      if (handle) {
        properties.width = `${Math.max(1,item.cssW + item.w*(nw/w-1))}px`;
        properties.height = `${Math.max(1,item.cssH + item.h*(nh/h-1))}px`;
        properties["min-width"] = "0"; properties["min-height"] = "0";
        properties["max-width"] = "none"; properties["max-height"] = "none";
      }
      for (const [name,value] of Object.entries(properties)) item.el.style.setProperty(name,value,"important");
      return {id:item.id, properties};
    });
    latest.current.refresh();
  };
  const finish = (event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    move(event);
    const edits = active.edits;
    cancel();
    if (active.html === latest.current.html && !latest.current.disabled && edits.length) input.commit(active.html, edits);
  };
  return {begin, move, finish, cancel, active: () => gesture.current !== null};
}
