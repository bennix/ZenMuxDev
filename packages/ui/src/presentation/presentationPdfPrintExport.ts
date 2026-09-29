import { materializePrintableFontFamilies } from "./presentationPdfPrintFonts.js";
import type {
  PresentationPreviewDocument,
  PresentationRenderHandle,
} from "@/presentation/types.js";

export interface PresentationPrintHost {
  dispose(): void;
}

const HOST_ATTRIBUTE = "data-zcode-pptx-print-host";
const PAGE_ATTRIBUTE = "data-zcode-pptx-print-page";
const STYLE_ATTRIBUTE = "data-zcode-pptx-print-style";

/** 单图解码失败不阻塞导出（预览同样会失败），整体解码等待设上限 */
const IMAGE_DECODE_TIMEOUT_MS = 10_000;

function formatCssPx(value: number): string {
  return `${Number(value.toFixed(2))}px`;
}

function buildPrintCss(pageSize: { width: number; height: number }): string {
  const landscape = pageSize.width >= pageSize.height;
  const paperWidth = landscape ? 297 : 210;
  const paperHeight = landscape ? 210 : 297;
  const width = `${paperWidth}mm`;
  const height = `${paperHeight}mm`;
  const pxPerMm = 96 / 25.4;
  const scale = Math.min(paperWidth * pxPerMm / pageSize.width, paperHeight * pxPerMm / pageSize.height);
  const left = (paperWidth * pxPerMm - pageSize.width * scale) / 2;
  const top = (paperHeight * pxPerMm - pageSize.height * scale) / 2;
  // screen 下不能用 display:none / visibility:hidden——canvas、img 需要真实绘制才能进入打印输出。
  // print 下 fixed 元素会在每一页重复，必须反转为 static；html/body 的 height:100% 会撑出尾部空白页。
  // 幻灯片内部元素的轻微溢出会露出原生滚动条并被画进 PDF，整体隐藏。
  return `
[${PAGE_ATTRIBUTE}] {
  width: ${width}; height: ${height}; position: relative; overflow: hidden;
  background: white; print-color-adjust: exact; -webkit-print-color-adjust: exact;
}
[${PAGE_ATTRIBUTE}] > [data-zcode-pptx-print-slide] {
  position: absolute; left: ${formatCssPx(left)}; top: ${formatCssPx(top)};
  width: ${formatCssPx(pageSize.width)}; height: ${formatCssPx(pageSize.height)};
  transform: scale(${scale}); transform-origin: top left;
}
[${HOST_ATTRIBUTE}] * {
  scrollbar-width: none;
}
[${HOST_ATTRIBUTE}] *::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
@media screen {
  [${HOST_ATTRIBUTE}] {
    position: fixed;
    top: 0;
    left: 0;
    z-index: -1;
    transform: translateX(-200vw);
    pointer-events: none;
  }
}
@media print {
  body > :not([${HOST_ATTRIBUTE}]) {
    display: none !important;
  }
  [${HOST_ATTRIBUTE}] {
    position: static !important;
    transform: none !important;
  }
  html,
  body {
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  @page {
    size: ${width} ${height};
    margin: 0;
  }
  [${PAGE_ATTRIBUTE}] {
    width: ${width};
    height: ${height};
    position: relative;
    overflow: hidden;
    break-after: page;
  }
  [${PAGE_ATTRIBUTE}]:last-child {
    break-after: auto;
  }
}
`;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

async function waitForPrintReady(hostDocument: Document, host: HTMLElement): Promise<void> {
  // 全部页渲染完成后再等字体，保证渲染过程中新触发的字体加载都计入
  await hostDocument.fonts?.ready;
  materializePrintableFontFamilies(hostDocument, host);
  // 字体替换可能命中新注册的 web font；再次等待后才能交给打印管线。
  await hostDocument.fonts?.ready;
  const decodes = Array.from(host.querySelectorAll("img"), (image) =>
    typeof image.decode === "function" ? image.decode().catch(() => undefined) : undefined,
  ).filter((pending): pending is Promise<void> => pending !== undefined);
  if (decodes.length > 0) {
    await Promise.race([
      Promise.all(decodes),
      new Promise((resolve) => setTimeout(resolve, IMAGE_DECODE_TIMEOUT_MS)),
    ]);
  }
  // 给 canvas/图表首帧绘制留渲染窗口
  await nextFrame();
  await nextFrame();
}

/**
 * 把演示文稿的全部页面渲染进同页面的隐藏打印容器，供 printToPDF 以 print 媒体输出。
 * 预览是 lazySlides 懒渲染，这里必须全量逐页渲染，导出的 PDF 才包含所有页。
 */
export async function renderPresentationToPrintHost(
  doc: PresentationPreviewDocument,
  hostDocument: Document,
): Promise<PresentationPrintHost> {
  const style = hostDocument.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = buildPrintCss(doc.pageSize);

  const host = hostDocument.createElement("div");
  host.setAttribute(HOST_ATTRIBUTE, "");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("inert", "");

  const handles: PresentationRenderHandle[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (let index = handles.length - 1; index >= 0; index -= 1) {
      handles[index]?.dispose();
    }
    host.remove();
    style.remove();
  };

  try {
    hostDocument.head.append(style);
    hostDocument.body.append(host);
    for (let pageIndex = 0; pageIndex < doc.pageCount; pageIndex += 1) {
      const page = hostDocument.createElement("div");
      page.setAttribute(PAGE_ATTRIBUTE, "");
      host.append(page);
      // A4 仅缩放外层，原幻灯片尺寸保持不变，避免正文重排。
      const slide = hostDocument.createElement("div");
      slide.setAttribute("data-zcode-pptx-print-slide", "");
      page.append(slide);
      const handle = doc.renderPage(pageIndex, slide);
      handles.push(handle);
      // 顺序 await：摊平媒体解码内存峰值；document 中途被 dispose 时尽快抛错终止
      await handle.ready;
    }
    await waitForPrintReady(hostDocument, host);
    return { dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
