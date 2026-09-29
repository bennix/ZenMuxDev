import PptxGenJS from "pptxgenjs";

/** 每页整图避免 Office 重新排版；此格式不承诺元素级编辑。 */
export async function buildImageDeckPptx(images: readonly string[]): Promise<Uint8Array> {
  if (!images.length) throw new Error("No slides to export");
  const deck = new (PptxGenJS as unknown as new () => {
    layout: string;
    author: string;
    subject: string;
    addSlide(): { addImage(options: object): void };
    write(options: { outputType: "uint8array" }): Promise<Uint8Array>;
  })();
  deck.layout = "LAYOUT_WIDE";
  deck.author = "ZenCode";
  deck.subject = "Visual slides (full-page images)";
  for (const data of images) {
    deck.addSlide().addImage({ data, x: 0, y: 0, w: 13.333333, h: 7.5 });
  }
  const bytes = await deck.write({ outputType: "uint8array" });
  return bytes as Uint8Array;
}

let renderer: Promise<import("@embedpdf/pdfium").WrappedPdfiumModule> | undefined;
async function loadRenderer() {
  renderer ??= (async () => {
    const [{ init }, asset] = await Promise.all([
      import("@embedpdf/pdfium"),
      import("@embedpdf/pdfium/pdfium.wasm?url"),
    ]);
    const response = await fetch(asset.default);
    if (!response.ok) throw new Error("PDF renderer unavailable");
    const engine = await init({
      wasmBinary: await response.arrayBuffer(),
      locateFile: () => new URL(asset.default, location.href).href,
    });
    engine.PDFiumExt_Init();
    return engine;
  })().catch((error) => {
    renderer = undefined;
    throw error;
  });
  return renderer;
}

/** 使用 PDFium 保留 Chromium 输出的 Type 1 渐变，避免 PDF.js 的粉色占位图案。 */
export async function buildVisualDeckPptx(pdfBytes: ArrayBuffer): Promise<Uint8Array> {
  const engine = await loadRenderer();
  const memory = engine.pdfium as typeof engine.pdfium & { HEAPU8: Uint8Array };
  const ptr = memory.wasmExports.malloc(pdfBytes.byteLength);
  if (!ptr) throw new Error("PDF allocation failed");
  let doc = 0;
  try {
    memory.HEAPU8.set(new Uint8Array(pdfBytes), ptr);
    doc = engine.FPDF_LoadMemDocument(ptr, pdfBytes.byteLength, "");
    if (!doc) throw new Error("PDF could not be opened");
    const images: string[] = [];
    for (let index = 0; index < engine.FPDF_GetPageCount(doc); index++) {
      const page = engine.FPDF_LoadPage(doc, index);
      if (!page) throw new Error("PDF page unavailable");
      let bitmap = 0;
      try {
        const width = engine.FPDF_GetPageWidth(page);
        const height = engine.FPDF_GetPageHeight(page);
        const scale = Math.max(2560 / width, 1440 / height);
        bitmap = engine.FPDFBitmap_Create(2560, 1440, 1);
        if (!bitmap) throw new Error("PDF bitmap allocation failed");
        engine.FPDFBitmap_FillRect(bitmap, 0, 0, 2560, 1440, 0xffffffff);
        // 只裁掉打印宿主添加的 A4 居中留白；RGBA 标志避免红蓝通道互换。
        const w = Math.round(width * scale);
        const h = Math.round(height * scale);
        engine.FPDF_RenderPageBitmap(
          bitmap,
          page,
          Math.round((2560 - w) / 2),
          Math.round((1440 - h) / 2),
          w,
          h,
          0,
          0x10,
        );
        const buffer = engine.FPDFBitmap_GetBuffer(bitmap);
        const pixels = new Uint8ClampedArray(
          memory.HEAPU8.subarray(buffer, buffer + 2560 * 1440 * 4),
        );
        const canvas = document.createElement("canvas");
        canvas.width = 2560;
        canvas.height = 1440;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.putImageData(new ImageData(pixels, 2560, 1440), 0, 0);
        images.push(canvas.toDataURL("image/png"));
        canvas.width = canvas.height = 0;
      } finally {
        if (bitmap) engine.FPDFBitmap_Destroy(bitmap);
        engine.FPDF_ClosePage(page);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return await buildImageDeckPptx(images);
  } finally {
    if (doc) engine.FPDF_CloseDocument(doc);
    memory.wasmExports.free(ptr);
  }
}
