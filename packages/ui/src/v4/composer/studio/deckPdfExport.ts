import { renderPresentationToPrintHost } from "@/presentation/presentationPdfPrintExport.js";
import { pageDocument } from "./deckPreviewDocument.js";
import { showSlide } from "./deckSlides.js";
import { presentSlide } from "./deckPreview.js";

const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;
const LOAD_TIMEOUT_MS = 15_000;

/** 与预览复用同一 HTML 和版式修正，隔离各页 CSS，避免转换 PPTX 后再次排版。 */
export async function renderDeckPdf(pages: readonly string[], hostDocument: Document) {
  if (pages.length === 0) throw new Error("No slides to export");
  return renderPresentationToPrintHost(
    {
      pageCount: pages.length,
      pageSize: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
      getPageElements: () => [],
      dispose() {},
      renderPage(index, container) {
        const frame = hostDocument.createElement("iframe");
        frame.setAttribute("sandbox", "allow-same-origin");
        frame.style.cssText = `display:block;border:0;width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;`;
        let timer: ReturnType<typeof setTimeout>;
        const ready = new Promise<void>((resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Slide assets timed out")), LOAD_TIMEOUT_MS);
          frame.onload = () => {
            void (async () => {
              const doc = frame.contentDocument;
              if (!doc) throw new Error("Slide document unavailable");
              await doc.fonts.ready;
              await Promise.all([...doc.images].map((image) => image.decode()));
              showSlide(doc, 0);
              presentSlide(doc);
              await doc.fonts.ready;
            })()
              .then(resolve, reject)
              .finally(() => clearTimeout(timer));
          };
          frame.srcdoc = pageDocument(pages[index]!);
          container.append(frame);
        });
        return {
          ready,
          dispose() {
            clearTimeout(timer);
            frame.onload = null;
            frame.remove();
          },
        };
      },
    },
    hostDocument,
  );
}
