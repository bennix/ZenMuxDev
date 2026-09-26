/**
 * 模型经常不写 data-pptx-slide，或者只包一层。预览就只剩 1 页，文字也没有种类标记，
 * 点选和保存都会认为没有可编辑内容。这里补上分页和文字标记。
 */

const SLIDE_CLASS = /(?:^|\s)(?:slide|page)(?:$|\s|\d|-)/iu;
const CONTROL_TOKEN = /<\|[^|>\n]{0,80}\|>|<\/?s>/u;

export function stripDeckNoise(text: string): string {
  return text.replace(new RegExp(CONTROL_TOKEN.source, "gu"), "");
}

export function hasDeckNoise(text: string): boolean {
  return new RegExp(CONTROL_TOKEN.source, "u").test(text);
}

function readableDeck(html: string): string {
  return stripDeckNoise(html).replace(/^```(?:html)?\s*/iu, "").replace(/```\s*$/u, "").trim();
}

export function countDeckSlides(html: string): number {
  const cleaned = readableDeck(html);
  if (!cleaned) return 0;
  const doc = new DOMParser().parseFromString(cleaned, "text/html");
  if (!doc.body) return 0;
  stampDeck(doc);
  return topSlides(doc).length;
}

export function deckSlideLabels(html: string): string[] {
  const cleaned = readableDeck(html);
  if (!cleaned) return [];
  const doc = new DOMParser().parseFromString(cleaned, "text/html");
  if (!doc.body) return [];
  stampDeck(doc);
  return topSlides(doc)
    .map((el) => (el.innerText || "").replace(/\s+/gu, " ").trim().slice(0, 42))
    .filter(Boolean);
}

export function dropUnclosedSection(html: string): string {
  const cleaned = stripDeckNoise(html);
  const opens = [...cleaned.matchAll(/<section\b/giu)];
  const closes = [...cleaned.matchAll(/<\/section>/giu)];
  if (opens.length <= closes.length) return cleaned;
  const last = opens[opens.length - 1];
  if (!last || last.index == null) return cleaned;
  return cleaned.slice(0, last.index);
}

export function dropLastSection(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const direct = [...doc.body.querySelectorAll(":scope > section")];
  const sections = direct.length > 0
    ? direct
    : [...doc.querySelectorAll("section")].filter((el) => !el.parentElement?.closest("section"));
  const last = sections[sections.length - 1];
  if (!last) return html;
  last.remove();
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export function mergeDeckSections(base: string, extra: string): string {
  const more = stripDeckNoise(extra).trim();
  if (!more) return base;
  const incoming = new DOMParser().parseFromString(more, "text/html");
  const direct = [...incoming.body.querySelectorAll(":scope > section")];
  const sections = direct.length > 0
    ? direct
    : [...incoming.querySelectorAll("section")].filter((el) => !el.parentElement?.closest("section"));
  if (sections.length === 0) {
    return /<\/body>/iu.test(base) ? base.replace(/<\/body>/iu, `${more}</body>`) : `${base}\n${more}`;
  }
  const host = new DOMParser().parseFromString(base, "text/html");
  stampDeck(host);
  stampDeck(incoming);
  const labelOf = (el: Element) => (el.textContent || "").replace(/\s+/gu, " ").trim().slice(0, 42);
  const seen = new Set(topSlides(host).map(labelOf).filter(Boolean));
  const incomingSlides = topSlides(incoming);
  const pages = incomingSlides.length > 0 ? incomingSlides : sections;
  for (const section of pages) {
    const label = labelOf(section);
    if (label && seen.has(label)) continue;
    if (label) seen.add(label);
    host.body.appendChild(host.importNode(section, true));
  }
  return `<!doctype html>\n${host.documentElement.outerHTML}`;
}

function elementKids(parent: Element): HTMLElement[] {
  return [...parent.children].filter((el): el is HTMLElement => el.namespaceURI === "http://www.w3.org/1999/xhtml" && el.tagName !== "STYLE" && el.tagName !== "SCRIPT" && el.tagName !== "LINK");
}

function isSlideLike(el: HTMLElement): boolean {
  return SLIDE_CLASS.test(el.className) || el.hasAttribute("data-slide");
}

function hasSlideHeight(el: HTMLElement): boolean {
  return /height:\s*720px/iu.test(el.getAttribute("style") ?? "");
}

function largestSiblingGroup(elements: readonly HTMLElement[]): HTMLElement[] {
  const groups = new Map<Element, HTMLElement[]>();
  for (const el of elements) {
    const parent = el.parentElement;
    if (!parent) continue;
    const list = groups.get(parent) ?? [];
    list.push(el);
    groups.set(parent, list);
  }
  let best: HTMLElement[] = [];
  for (const list of groups.values()) {
    if (list.length > best.length) best = list;
  }
  return best;
}

function slideCandidates(body: HTMLElement): HTMLElement[] {
  const kids = elementKids(body);
  const topSlides = kids.filter((el) => isSlideLike(el));
  if (topSlides.length > 1) return topSlides;
  if (kids.length > 1 && kids.every((el) => el.tagName === "SECTION" || el.tagName === "ARTICLE")) return kids;
  const topHeight = kids.filter((el) => hasSlideHeight(el));
  if (topHeight.length > 1) return topHeight;
  const deep = [...body.querySelectorAll<HTMLElement>("*")].filter((el) => isSlideLike(el) || hasSlideHeight(el));
  const group = largestSiblingGroup(deep);
  if (group.length > 1) return group;
  return kids.length === 1 ? kids : [];
}

export function stampDeck(doc: Document): void {
  const body = doc.body;
  if (!body) return;
  const candidates = topSlides(doc).length > 0 ? [] : slideCandidates(body);
  if (candidates.length > 1) {
    for (const el of doc.querySelectorAll("[data-pptx-slide]")) {
      if (!candidates.includes(el as HTMLElement)) el.removeAttribute("data-pptx-slide");
    }
    for (const el of candidates) el.setAttribute("data-pptx-slide", "");
  } else if (!doc.querySelector("[data-pptx-slide]") && candidates[0]) {
    candidates[0].setAttribute("data-pptx-slide", "");
  }
  // 混合容器的直接正文曾被导出的 leaf 条件丢弃；独立成段后可选择、可编辑且不重复导出。
  for (const el of body.querySelectorAll<HTMLElement>("*")) {
    if (el.closest("svg,script,style") || ![...el.children].some(child => child.textContent?.trim())) continue;
    let run: ChildNode[] = [];
    const flush = () => {
      if (run.some(node => node.nodeType === 3 && node.textContent?.trim())) {
        const span = doc.createElement("span");
        span.setAttribute("data-pptx-kind", "text");
        span.setAttribute("data-pptx-text-run", "");
        el.insertBefore(span, run[0]!);
        for (const node of run) span.appendChild(node);
      }
      run = [];
    };
    // flush 会移动节点，必须遍历快照而非 live NodeList。
    const children = Array.from(el.childNodes);
    for (const node of children) {
      if (node.nodeType === 3 || (node.nodeType === 1 && (node as Element).tagName === "BR")) run.push(node);
      else flush();
    }
    flush();
  }
  for (const el of doc.querySelectorAll<HTMLElement>("img")) {
    if (!el.getAttribute("data-pptx-kind")) el.setAttribute("data-pptx-kind", "image");
  }
  for (const el of doc.querySelectorAll("svg")) {
    if (el.closest("svg") === el && !el.getAttribute("data-pptx-kind")) el.setAttribute("data-pptx-kind", "image");
  }
  for (const el of body.querySelectorAll<HTMLElement>("*")) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
    if (el.closest("svg") && el.tagName !== "SVG") continue;
    if (el.hasAttribute("data-pptx-slide")) continue;
    const direct = [...el.childNodes].some((node) => node.nodeType === 3 && (node.textContent || "").trim());
    if (!direct) continue;
    if (!el.getAttribute("data-pptx-kind")) el.setAttribute("data-pptx-kind", "text");
  }
}

export function topSlides(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>("[data-pptx-slide]")].filter((el) => !el.parentElement?.closest("[data-pptx-slide]"));
}

function reveal(el: HTMLElement): void {
  if (getComputedStyle(el).display === "none") el.style.display = "block";
}

export function layoutSlides(doc: Document): HTMLElement[] {
  const marked = topSlides(doc);
  if (marked.length > 1) return marked;
  const root = marked[0] ?? doc.body;
  if (!root) return [];
  const pages = elementKids(root).filter((el) => {
    const height = el.getBoundingClientRect().height;
    return (height >= 640 && height <= 800) || isSlideLike(el) || hasSlideHeight(el);
  });
  if (pages.length < 2) return marked.length === 1 ? marked : [root];
  root.removeAttribute("data-pptx-slide");
  for (const page of pages) {
    page.setAttribute("data-pptx-slide", "");
    reveal(page);
  }
  return pages;
}

/** 测量在屏幕外的 iframe 里做。模型常用 display:none 或 hidden 藏起非当前页，不先打开就量不到字。 */
export function revealSlides(roots: readonly HTMLElement[]): void {
  for (const root of roots) {
    root.removeAttribute("hidden");
    root.style.display = "block";
    root.style.visibility = "visible";
    root.style.opacity = "1";
  }
}

export function waitForSlideDocument(frame: HTMLIFrameElement, html: string): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const ready = () => {
      const body = frame.contentDocument?.body;
      const hasSlide = Boolean(body && body.childElementCount > 0 && ((body.textContent || "").trim() || body.querySelector("[data-pptx-kind], svg, img")));
      if (hasSlide || Date.now() - started > 2500) resolve();
      else requestAnimationFrame(ready);
    };
    frame.addEventListener("load", () => requestAnimationFrame(ready));
    frame.srcdoc = html;
    document.body.appendChild(frame);
    requestAnimationFrame(ready);
  });
}

export function showSlide(doc: Document, index: number): number {
  const slides = layoutSlides(doc).filter((el) => el !== doc.body && el !== doc.documentElement);
  if (slides.length === 0) return 1;
  slides.forEach((el, i) => {
    const current = i === index;
    el.toggleAttribute("hidden", !current);
    if (current) reveal(el);
  });
  return slides.length;
}
