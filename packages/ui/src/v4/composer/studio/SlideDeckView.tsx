import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { presentSlide } from "./deckPreview.js";
import { showSlide, topSlides } from "./deckSlides.js";
import { useSlideGeometry, type GeometryEdit } from "./useSlideGeometry.js";
import { SlideSelectionControls } from "./SlideSelectionControls.js";
import { prepareDeckHtml } from "./htmlToEditablePptx.js";

interface MarkBox {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const BLANK_PAGE = "<!doctype html><html><head></head><body></body></html>";

function pageDocument(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(prepareDeckHtml(html), "text/html");
    const root = doc.documentElement;
    if (!root) return BLANK_PAGE;
    for (const section of topSlides(doc)) section.removeAttribute("hidden");
    const style = doc.createElement("style");
    style.textContent = "html,body{margin:0}[data-pptx-slide][hidden]{display:none!important}[data-pptx-slide],[data-pptx-slide] *{animation:none!important;transition:none!important}[data-pptx-picked]{outline:4px solid #2563eb!important;outline-offset:-4px!important;box-shadow:inset 0 0 0 9999px rgba(37,99,235,.28)!important}[data-pptx-hover]{outline:3px dashed #2563eb!important;outline-offset:-3px!important}";
    // 流式 HTML 解析完之前 head 可能还不存在，直接写 style 会把整个创作区打崩。
    (doc.head ?? root).appendChild(style);
    return `<!doctype html>\n${root.outerHTML}`;
  } catch {
    return BLANK_PAGE;
  }
}

function markBox(el: Element, key: string, scale: number): MarkBox {
  const root = el.ownerDocument.documentElement.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return {
    key,
    x: (rect.left - root.left) * scale,
    y: (rect.top - root.top) * scale,
    w: rect.width * scale,
    h: rect.height * scale,
  };
}

function paintMarks(doc: Document, ids: readonly string[]): void {
  for (const el of doc.querySelectorAll<HTMLElement>("[data-pptx-picked], [data-pptx-hover]")) {
    el.removeAttribute("data-pptx-picked");
    el.removeAttribute("data-pptx-hover");
    el.style.outline = "";
    el.style.outlineOffset = "";
  }
  for (const id of ids) {
    const el = doc.querySelector<HTMLElement>(`[data-pptx-id="${CSS.escape(id)}"]`);
    if (!el) continue;
    el.setAttribute("data-pptx-picked", "");
    el.style.outline = "4px solid #2563eb";
    el.style.outlineOffset = "-4px";
  }
}

function framePoint(host: HTMLElement, doc: Document, clientX: number, clientY: number): { x: number; y: number } | null {
  const hostBox = host.getBoundingClientRect();
  const root = doc.documentElement;
  if (!root || hostBox.width < 1) return null;
  const rootBox = root.getBoundingClientRect();
  // 预览把 1280 宽的 iframe 做了缩放。元素矩形在 iframe 自己的坐标系里，不能直接用屏幕坐标。
  const scale = hostBox.width / 1280;
  return {
    x: rootBox.left + (clientX - hostBox.left) / scale,
    y: rootBox.top + (clientY - hostBox.top) / scale,
  };
}

function pickTarget(doc: Document, x: number, y: number, tolerance: number): HTMLElement | null {
  const hits = [...doc.querySelectorAll<HTMLElement>("[data-pptx-id]")].filter((el) => {
    if (el.hasAttribute("data-pptx-slide") || el.closest("[hidden]")) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && x >= box.left - tolerance && x <= box.right + tolerance && y >= box.top - tolerance && y <= box.bottom + tolerance;
  });
  hits.sort((a, b) => {
    const left = a.getBoundingClientRect();
    const right = b.getBoundingClientRect();
    return left.width * left.height - right.width * right.height;
  });
  return hits[0] ?? null;
}

function sameBox(current: MarkBox | null, next: MarkBox): boolean {
  return Boolean(
    current
    && current.key === next.key
    && Math.abs(current.x - next.x) < 0.5
    && Math.abs(current.y - next.y) < 0.5
    && Math.abs(current.w - next.w) < 0.5
    && Math.abs(current.h - next.h) < 0.5,
  );
}

export function SlideDeckView({
  html,
  page,
  total,
  onPageChange,
  selectedIds,
  setSelectedIds,
  onGeometryChange,
  disabled = false,
}: {
  html: string;
  disabled?: boolean;
  onGeometryChange?: (source: string, edits: GeometryEdit[]) => void;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  selectedIds: readonly string[];
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
}) {
  const { intl } = useZCodeIntl();
  const boxRef = useRef<HTMLDivElement>(null);
  const revealPickedRef = useRef<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [selecting, setSelecting] = useState(false);
  const [hoverBox, setHoverBox] = useState<MarkBox | null>(null);
  const [pickedBoxes, setPickedBoxes] = useState<MarkBox[]>([]);
  const selectingRef = useRef(false);
  selectingRef.current = selecting;
  const index = page;
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  const listRef = useRef<HTMLDivElement>(null);
  const srcDoc = useMemo(() => pageDocument(html), [html]);
  const parsed = new DOMParser().parseFromString(prepareDeckHtml(html), "text/html");
  const elements = [...parsed.body.querySelectorAll<HTMLElement>("[data-pptx-id]")].filter(el => !el.hasAttribute("data-pptx-slide") && (!el.closest("svg") || el.closest("svg") === (el as Element)));
  const refresh = () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const next = selectedRef.current.flatMap((id) => {
      const el = doc.querySelector(`[data-pptx-id="${CSS.escape(id)}"]`);
      return el ? [markBox(el, id, (boxRef.current?.clientWidth ?? 1280) / 1280)] : [];
    });
    setPickedBoxes(current => current.length === next.length && current.every((box,index)=>sameBox(box,next[index]!)) ? current : next);
  };
  const geometry = useSlideGeometry({ html, disabled: disabled || !selecting || !onGeometryChange,
    document: () => frameRef.current?.contentDocument ?? null,
    scale: () => (boxRef.current?.clientWidth ?? 1280) / 1280,
    refresh, commit: (source, edits) => onGeometryChange?.(source, edits),
  });
  const group = pickedBoxes.length ? {
    x: Math.min(...pickedBoxes.map(box => box.x)), y: Math.min(...pickedBoxes.map(box => box.y)),
    right: Math.max(...pickedBoxes.map(box => box.x + box.w)), bottom: Math.max(...pickedBoxes.map(box => box.y + box.h)),
  } : null;

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const update = () => setScale(node.clientWidth / 1280);
    update();
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(update);
    });
    observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(resizeFrame); };
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let detach = () => {};
    const bind = () => {
      detach();
      const doc = frame.contentDocument;
      if (!doc) return;
      requestAnimationFrame(() => {
        const live = frame.contentDocument;
        if (live !== doc || !live.documentElement) return;
        showSlide(live, 0);
        presentSlide(live);
        if (selectingRef.current) { paintMarks(live, selectedRef.current); refresh(); }
      });
      void doc.fonts.ready.then(() => { if (frame.contentDocument === doc && selectingRef.current) refresh(); });
      detach = () => {};

    };
    bind();
    frame.addEventListener("load", bind);
    return () => {
      detach();
      frame.removeEventListener("load", bind);
    };
  }, [srcDoc, index]);

  useEffect(() => {
    const id = revealPickedRef.current;
    if (!id || !pickedBoxes.some(box => box.key === id)) return;
    const control = boxRef.current?.querySelector<HTMLElement>('[data-testid="ppt-move-selection"]');
    if (!control) return;
    revealPickedRef.current = null;
    control.scrollIntoView({block:"nearest",inline:"nearest"});
    control.focus({preventScroll:true});
  }, [pickedBoxes]);

  const hitAt = (event: { clientX: number; clientY: number }): HTMLElement | null => {
    const frame = frameRef.current;
    const host = boxRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !host || !doc) return null;
    const point = framePoint(host, doc, event.clientX, event.clientY);
    if (!point) return null;
    return pickTarget(doc, point.x, point.y, 4 * 1280 / host.clientWidth);
  };

  const showHover = (event: { clientX: number; clientY: number }) => {
    const host = boxRef.current;
    const doc = frameRef.current?.contentDocument;
    const el = hitAt(event);
    if (!host || !doc || !el) {
      setHoverBox((current) => (current ? null : current));
      return;
    }
    const id = el.getAttribute("data-pptx-id") ?? "hover";
    const next = markBox(el, id, host.clientWidth / 1280);
    setHoverBox((current) => (sameBox(current, next) ? current : next));
  };

  const choose = (event: { clientX: number; clientY: number; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): string[] => {
    const doc = frameRef.current?.contentDocument;
    const id = hitAt(event)?.getAttribute("data-pptx-id");
    if (!doc || !id) { setSelectedIds([]); return []; }
    const multi = event.shiftKey || event.metaKey || event.ctrlKey;
    const next = multi ? (selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id])
      : selectedIds.includes(id) ? [...selectedIds] : [id];
    setSelectedIds(next);
    return next;
  };

  useEffect(() => {
    const frame = frameRef.current;
    const host = boxRef.current;
    const doc = frame?.contentDocument;
    const root = doc?.documentElement;
    if (!frame || !host || !doc || !root) return;
    root.style.cursor = selecting ? "crosshair" : "";
    if (!selecting) {
      paintMarks(doc, []);
      setHoverBox(null);
      setPickedBoxes([]);
      return;
    }
    paintMarks(doc, selectedIds);
    const picked = selectedIds.flatMap((id) => {
      const el = doc.querySelector(`[data-pptx-id="${CSS.escape(id)}"]`);
      const box = el ? markBox(el, id, host.clientWidth / 1280) : null;
      return box && box.w > 0 && box.h > 0 ? [box] : [];
    });
    setPickedBoxes(picked);
  }, [selectedIds, srcDoc, selecting, scale]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !selectedIds.length) return;
    list.closest("details")?.setAttribute("open", "");
    const item = list.querySelector<HTMLElement>(`[data-testid="ppt-element-${CSS.escape(selectedIds.at(-1)!)}"]`);
    if (item) {
      const bounds=list.getBoundingClientRect(), rect=item.getBoundingClientRect();
      if (rect.top < bounds.top) list.scrollTop += rect.top-bounds.top;
      else if(rect.bottom > bounds.bottom) list.scrollTop += rect.bottom-bounds.bottom;
    }
  }, [selectedIds, selecting]);

  return (
    <div className="mt-2">
      <div className="max-h-screen overflow-auto">
      <div ref={boxRef} className="relative w-full overflow-hidden rounded-xl border border-border bg-background" style={{ position: "relative", isolation: "isolate", height: 720 * scale, width: `${zoom * 100}%` }}>
        <iframe
          ref={frameRef}
          title="ppt"
          sandbox="allow-same-origin"
          srcDoc={srcDoc}
          className="absolute left-0 top-0 z-0 border-0"
          style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: "top left" }}
        />
        {selecting ? (
          <div
            data-testid="ppt-selection-overlay"
            tabIndex={0}
            style={{ touchAction: "none", position: "absolute", inset: 0, zIndex: 20 }}
            className="absolute inset-0 z-20 cursor-move"
            onKeyDown={(event) => { if (event.key === "Escape") geometry.cancel(); }}
            onPointerDown={(event) => {
              event.preventDefault();
              if (disabled) return;
              const ids = choose(event);
              if (!event.shiftKey && !event.metaKey && !event.ctrlKey) geometry.begin(event, ids);
            }}
            onPointerMove={(event) => { if (geometry.active()) geometry.move(event); else showHover(event); }}
            onPointerUp={geometry.finish}
            onPointerCancel={geometry.cancel}
            onLostPointerCapture={geometry.cancel}
            onPointerLeave={() => setHoverBox((current) => (current ? null : current))}
          />
        ) : null}
        {selecting && hoverBox && !selectedIds.includes(hoverBox.key) ? (
          <div
            className="pointer-events-none absolute z-30 border-2 border-dashed border-blue-600"
            style={{ left: hoverBox.x, top: hoverBox.y, width: hoverBox.w, height: hoverBox.h }}
          />
        ) : null}
        {selecting
          ? pickedBoxes.map((box) => (
            <div
              key={box.key}
              className="pointer-events-none absolute z-30 border-2 border-blue-600 bg-blue-600/10"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
            />
          ))
          : null}
        {selecting && !disabled && onGeometryChange && group ? <SlideSelectionControls
          bounds={group} canvasWidth={1280*scale} canvasHeight={720*scale} ids={selectedIds} geometry={geometry}
        /> : null}
      </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-ui-caption">
        <label>{intl.formatMessage({ id: "chat.studio.zoom" })}
          <select aria-label={intl.formatMessage({ id: "chat.studio.zoom" })} value={zoom} onChange={event => { geometry.cancel(); setZoom(Number(event.target.value)); }} className="ml-1 rounded-lg border border-border bg-background px-2">
            {[1, 1.5, 2, 3].map(value => <option key={value} value={value}>{value * 100}%</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={selecting}
            onChange={(event) => {
              const next = event.target.checked;
              setSelecting(next);
              if (!next) setSelectedIds([]);
            }}
          />
          {intl.formatMessage({ id: "chat.studio.selectMode" })}
        </label>
        <Button type="button" variant="ghost" className="h-7 px-2" disabled={index <= 0} onClick={() => { onPageChange(index - 1); setSelectedIds([]); }}>
          {intl.formatMessage({ id: "chat.studio.prevPage" })}
        </Button>
        <span className="text-muted-foreground">
          {intl.formatMessage({ id: "chat.studio.page" }, { page: index + 1, total })}
        </span>
        <Button type="button" variant="ghost" className="h-7 px-2" disabled={index >= total - 1} onClick={() => { onPageChange(index + 1); setSelectedIds([]); }}>
          {intl.formatMessage({ id: "chat.studio.nextPage" })}
        </Button>
        <span className="text-muted-foreground">
          {selectedIds.length > 0
            ? intl.formatMessage({ id: "chat.studio.geometryHint" }, { count: selectedIds.length })
            : intl.formatMessage({ id: selecting ? "chat.studio.pickElements" : "chat.studio.selectOff" })}
        </span>
      </div>
      {selecting ? <details className="mt-2 text-ui-caption">
        <summary>{intl.formatMessage({ id: "chat.studio.elements" }, { count: elements.length })}</summary>
        <div ref={listRef} className="mt-1 max-h-48 overflow-auto">
          {elements.map(el => {
            const id = el.getAttribute("data-pptx-id")!;
            const label = `${el.getAttribute("data-pptx-kind") ?? el.tagName.toLowerCase()} · ${(el.textContent ?? "").trim().slice(0, 60)} · ${id}`;
            return <button key={id} type="button" disabled={disabled} data-testid={`ppt-element-${id}`} aria-pressed={selectedIds.includes(id)}
              className={`block w-full rounded-lg px-2 py-1 text-left text-ui-caption ${selectedIds.includes(id) ? "bg-selected text-foreground ring-1 ring-inset ring-icon-blue" : "hover:bg-hover"}`}
              onClick={event => {
                geometry.cancel();
                const multi = event.shiftKey || event.metaKey || event.ctrlKey;
                if (!multi) revealPickedRef.current = id;
                setSelectedIds(current => multi ? current.includes(id) ? current.filter(item => item !== id) : [...current, id] : [id]);
              }}>
              {selectedIds.includes(id) ? "✓ " : ""}{label}
            </button>;
          })}
        </div>
      </details> : null}
    </div>
  );
}
