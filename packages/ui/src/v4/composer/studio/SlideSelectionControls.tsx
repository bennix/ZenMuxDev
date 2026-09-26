import { Move } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { ResizeHandle, useSlideGeometry } from "./useSlideGeometry.js";

export function SlideSelectionControls({
  bounds,
  canvasWidth,
  canvasHeight,
  ids,
  geometry,
}: {
  bounds: { x: number; y: number; right: number; bottom: number };
  canvasWidth: number;
  canvasHeight: number;
  ids: readonly string[];
  geometry: ReturnType<typeof useSlideGeometry>;
}) {
  const { intl } = useZCodeIntl();
  const clamp = (value: number, size: number, limit: number) =>
    Math.max(size / 2, Math.min(limit - size / 2, value));
  const events = {
    onPointerMove: geometry.move,
    onPointerUp: geometry.finish,
    onPointerCancel: geometry.cancel,
    onLostPointerCapture: geometry.cancel,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") geometry.cancel();
    },
  };
  return (
    <>
      <div data-testid="ppt-selection-bounds" aria-hidden="true" style={{position:"absolute",zIndex:35,pointerEvents:"none",boxSizing:"border-box",border:"2px solid #2563eb",left:bounds.x,top:bounds.y,width:bounds.right-bounds.x,height:bounds.bottom-bounds.y}} />
      {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as ResizeHandle[]).map((handle) => {
        const size = handle.length === 2 ? 20 : 12;
        const x = handle.includes("w")
          ? bounds.x
          : handle.includes("e")
            ? bounds.right
            : (bounds.x + bounds.right) / 2;
        const y = handle.includes("n")
          ? bounds.y
          : handle.includes("s")
            ? bounds.bottom
            : (bounds.y + bounds.bottom) / 2;
        return (
          <button
            key={handle}
            type="button"
            aria-label={intl.formatMessage({ id: "chat.studio.resize" }, { direction: handle })}
            data-testid={`ppt-resize-${handle}`}
            className="absolute z-30 rounded-sm border-2 border-icon-blue bg-background shadow-sm"
            // 手柄保持屏幕尺寸并向画布内夹取，避免边缘控件被 overflow 裁掉。
            style={{
              position: "absolute",
              zIndex: 40,
              backgroundColor: "#ffffff",
              border: "2px solid #2563eb",
              left: clamp(x, size, canvasWidth),
              top: clamp(y, size, canvasHeight),
              width: size,
              height: size,
              transform: "translate(-50%, -50%)",
              cursor: `${handle}-resize`,
              touchAction: "none",
            }}
            onPointerDown={(event) => geometry.begin(event, ids, handle)}
            {...events}
          />
        );
      })}
      <button
        type="button"
        data-testid="ppt-move-selection"
        aria-label={intl.formatMessage({ id: "chat.studio.moveSelection" })}
        title={intl.formatMessage({ id: "chat.studio.moveSelection" })}
        className="absolute z-30 grid place-items-center rounded-lg border-2 border-icon-blue bg-background text-icon-blue shadow-sm cursor-move"
        style={{
          position: "absolute",
          zIndex: 40,
          backgroundColor: "#ffffff",
          color: "#2563eb",
          border: "2px solid #2563eb",
          left: clamp((bounds.x + bounds.right) / 2, 28, canvasWidth),
          top: clamp(bounds.y - 20, 28, canvasHeight),
          width: 28,
          height: 28,
          transform: "translate(-50%, -50%)",
          touchAction: "none",
        }}
        // 直接使用列表选中的 ID，不能再按最小命中面积误选容器里的子元素。
        onPointerDown={(event) => geometry.begin(event, ids)}
        {...events}
      >
        <Move className="size-4" aria-hidden="true" />
      </button>
    </>
  );
}
