import PptxGenJS from "pptxgenjs";
import type { EditableHtmlPage } from "./htmlToEditablePptx.js";

const SLIDE_W = 1280;
const SLIDE_H = 720;

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
  addText(text: string | Array<{ text: string; options?: object }>, options: object): void;
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

/** 保留浏览器测量坐标；导出时二次挤压和移动会使 PPT 偏离预览。 */
export async function buildEditableDeckPptx(
  pages: readonly EditableHtmlPage[],
): Promise<Uint8Array> {
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
        slide.addShape(
          node.triangleRotation !== undefined
            ? pptx.ShapeType.triangle
            : node.radius && node.radius > 2
              ? pptx.ShapeType.roundRect
              : pptx.ShapeType.rect,
          {
            rotate: node.triangleRotation,
            x: node.triangleRotation === 90 || node.triangleRotation === 270 ? x + (w - h) / 2 : x,
            y: node.triangleRotation === 90 || node.triangleRotation === 270 ? y + (h - w) / 2 : y,
            w: node.triangleRotation === 90 || node.triangleRotation === 270 ? h : w,
            h: node.triangleRotation === 90 || node.triangleRotation === 270 ? w : h,
            fill: node.fill
              ? { color: asHex(node.fill, "FFFFFF"), transparency: node.fillTransparency ?? 0 }
              : { color: "FFFFFF", transparency: 100 },
            line: hasLine
              ? {
                  color: asHex(node.lineColor, "000000"),
                  width: Math.max(0.25, (node.lineWidth ?? 1) * 0.75),
                }
              : { color: "FFFFFF", transparency: 100 },
            rectRadius: node.radius ? Math.min(1, (node.radius * sx) / Math.min(w, h)) : 0,
          },
        );
      } else if (node.kind === "text" && node.text?.trim()) {
        const baseFontSize = Math.min(72, Math.max(6, (node.fontSize || 18) * 0.75));
        const textValue = node.textRuns?.length
          ? node.textRuns.map((run) => ({
              text: run.text,
              options: {
                fontFace: run.fontFace,
                fontSize: run.fontSize ? run.fontSize * 0.75 : baseFontSize,
                ...(run.bold ? { bold: true } : {}),
                ...(run.italic ? { italic: true } : {}),
                ...(run.color ? { color: run.color } : {}),
              },
            }))
          : node.text.trim();
        const lineSpacingMultiple =
          node.lineHeight && node.fontSize
            ? Math.max(0.8, Math.min(3, node.lineHeight / node.fontSize))
            : undefined;
        slide.addText(textValue, {
          x,
          y,
          w,
          h,
          margin: 0,
          wrap: !node.noWrap,
          lang: "zh-CN",
          isTextBox: true,
          color: asHex(node.color, "1A1A1A"),
          fontFace: node.fontFace || "Arial",
          fontSize: baseFontSize,
          bold: node.bold,
          italic: node.italic,
          bullet: node.bullet ? { indent: Math.max(12, (node.fontSize || 18) * 0.45) } : undefined,
          align: node.align ?? "left",
          valign: node.valign ?? "top",
          lineSpacingMultiple,
        });
      } else if (node.kind === "image" && node.src) {
        const data = await loadImage(node.src);
        if (!data) continue;
        slide.addImage({
          data,
          x,
          y,
          w,
          h,
          sizing:
            node.objectFit === "cover" || node.objectFit === "contain"
              ? { type: node.objectFit, w, h }
              : undefined,
        });
      }
    }
  }
  const bytes = await pptx.write({ outputType: "uint8array" });
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer);
}
