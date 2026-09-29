import { prepareDeckHtml } from "./deckHtmlOps.js";
import { topSlides } from "./deckSlides.js";

const BLANK_PAGE = "<!doctype html><html><head></head><body></body></html>";

export function pageDocument(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(prepareDeckHtml(html), "text/html");
    const root = doc.documentElement;
    if (!root) return BLANK_PAGE;
    for (const section of topSlides(doc)) section.removeAttribute("hidden");
    const style = doc.createElement("style");
    style.textContent =
      "html,body{margin:0}[data-pptx-slide][hidden]{display:none!important}[data-pptx-slide],[data-pptx-slide] *{animation:none!important;transition:none!important}[data-pptx-picked]{outline:4px solid #2563eb!important;outline-offset:-4px!important;box-shadow:inset 0 0 0 9999px rgba(37,99,235,.28)!important}[data-pptx-hover]{outline:3px dashed #2563eb!important;outline-offset:-3px!important}";
    // 流式 HTML 解析完之前 head 可能还不存在，直接写 style 会把整个创作区打崩。
    (doc.head ?? root).appendChild(style);
    return `<!doctype html>\n${root.outerHTML}`;
  } catch {
    return BLANK_PAGE;
  }
}
