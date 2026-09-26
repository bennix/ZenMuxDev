import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from "react";

export interface SketchPadHandle {
  exportMarked: (background?: Blob | null) => Promise<Blob | null>;
  clear: () => void;
  hasInk: () => boolean;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const REST_VIEW: View = { scale: 1, x: 0, y: 0 };

const BRUSH_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M3 21l3.2-.8L19 7.4 16.6 5 3.8 17.8 3 21z' fill='%23111'/><path d='M16.6 5l2.4 2.4' stroke='%23111' stroke-width='1.2'/></svg>",
)}") 3 21, crosshair`;

const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M4.2 15.2 9.8 20.8l9.6-9.6-5.6-5.6-9.6 9.6z' fill='%23fff' stroke='%23111' stroke-width='1.4' stroke-linejoin='round'/><path d='M11.4 8.4l4.2 4.2' stroke='%23e11d48' stroke-width='1.8'/></svg>",
)}") 5 19, cell`;

export const SketchPad = forwardRef<
  SketchPadHandle,
  { backgroundUrl: string | null; color: string; width: number; erase: boolean }
>(function SketchPad({ backgroundUrl, color, width, erase }, ref) {
  const frameRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const panning = useRef(false);
  const space = useRef(false);
  const hover = useRef(false);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const inked = useRef(false);
  const [view, setView] = useState<View>(REST_VIEW);
  const [panCursor, setPanCursor] = useState<"brush" | "pan" | "panning">("brush");
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const canvas = inkRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    setView(REST_VIEW);
  }, [backgroundUrl]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((current) => ({ ...current, scale: zoomScale(current.scale, event.deltaY) }));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !hover.current) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      space.current = true;
      setPanCursor("pan");
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      space.current = false;
      setPanCursor("brush");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    hasInk: () => inked.current || canvasHasInk(inkRef.current),
    clear: () => {
      const canvas = inkRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      inked.current = false;
    },
    exportMarked: (background) => exportMarked(inkRef.current, background ?? null),
  }));

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = inkRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const paint = (from: { x: number; y: number } | null, to: { x: number; y: number }) => {
    const context = inkRef.current?.getContext("2d");
    if (!context) return;
    context.globalCompositeOperation = erase ? "destination-out" : "source-over";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = width;
    context.lineCap = "round";
    context.lineJoin = "round";
    if (from) {
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(to.x, to.y, Math.max(width / 2, 1), 0, Math.PI * 2);
      context.fill();
    }
    inked.current = true;
  };

  const toolCursor = erase ? ERASER_CURSOR : BRUSH_CURSOR;
  const cursor = panCursor === "panning" ? "grabbing" : panCursor === "pan" ? "grab" : toolCursor;

  return (
    <div
      ref={frameRef}
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-background"
      style={{ cursor }}
      onPointerEnter={() => {
        hover.current = true;
      }}
      onPointerLeave={() => {
        hover.current = false;
      }}
    >
      <div
        className="absolute inset-0"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "center center" }}
      >
        {backgroundUrl ? (
          <img src={backgroundUrl} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain" />
        ) : null}
        <canvas
          ref={inkRef}
          width={768}
          height={432}
        className="absolute inset-0 z-10 size-full touch-none"
          style={{ cursor }}
          onPointerDown={(event) => {
            if (event.button === 1 || space.current) {
              event.preventDefault();
              panning.current = true;
              setPanCursor("panning");
              pan.current = { x: event.clientX, y: event.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
              event.currentTarget.setPointerCapture(event.pointerId);
              return;
            }
            if (event.button !== 0) return;
            setPanCursor("brush");
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = true;
            const next = point(event);
            last.current = next;
            if (next) paint(null, next);
          }}
          onPointerMove={(event) => {
            if (panning.current && pan.current) {
              const start = pan.current;
              setView((current) => ({
                ...current,
                x: start.ox + event.clientX - start.x,
                y: start.oy + event.clientY - start.y,
              }));
              return;
            }
            if (!drawing.current) return;
            const next = point(event);
            if (!next) return;
            paint(last.current, next);
            last.current = next;
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            panning.current = false;
            pan.current = null;
            drawing.current = false;
            last.current = null;
            setPanCursor(space.current ? "pan" : "brush");
          }}
        />
      </div>
    </div>
  );
});

export function ZoomPanImage({ src }: { src: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(REST_VIEW);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    setView(REST_VIEW);
  }, [src]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((current) => ({ ...current, scale: zoomScale(current.scale, event.deltaY) }));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={frameRef}
      className="relative mt-2 h-80 w-full cursor-grab overflow-hidden rounded-xl border border-border bg-background active:cursor-grabbing"
      onPointerDown={(event) => {
        if (event.button !== 0 && event.button !== 1) return;
        pan.current = { x: event.clientX, y: event.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = pan.current;
        if (!start) return;
        setView((current) => ({
          ...current,
          x: start.ox + event.clientX - start.x,
          y: start.oy + event.clientY - start.y,
        }));
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        pan.current = null;
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      />
    </div>
  );
}

function zoomScale(current: number, deltaY: number): number {
  const next = current * (deltaY < 0 ? 1.1 : 1 / 1.1);
  return Math.min(8, Math.max(1, Number(next.toFixed(3))));
}

function canvasHasInk(canvas: HTMLCanvasElement | null): boolean {
  if (!canvas) return false;
  const context = canvas.getContext("2d");
  if (!context) return false;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 0) > 10) return true;
  }
  return false;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

function containRect(sourceWidth: number, sourceHeight: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

async function exportMarked(ink: HTMLCanvasElement | null, background: Blob | null): Promise<Blob | null> {
  if (!ink || !canvasHasInk(ink)) return null;
  const output = document.createElement("canvas");
  output.width = ink.width;
  output.height = ink.height;
  const context = output.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);
  if (background) {
    const bitmap = await createImageBitmap(background);
    const fitted = containRect(bitmap.width, bitmap.height, output.width, output.height);
    context.drawImage(bitmap, fitted.x, fitted.y, fitted.width, fitted.height);
    bitmap.close();
  }
  context.drawImage(ink, 0, 0);
  return canvasToBlob(output);
}
