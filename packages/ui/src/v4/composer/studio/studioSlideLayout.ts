import { callZenMuxSystemOne } from "@zcode/shared";
import { useStudioRepairModelStore } from "@/store/studioRepairModelStore.js";
import { streamStudioChat, type StudioRetry } from "./studioChatRetry.js";
import { applyDeckTheme, type DeckTheme } from "./deckTheme.js";
import { prepareDeckHtml, measureDeckPages } from "./htmlToEditablePptx.js";
import { presentSlide } from "./deckPreview.js";
import { showSlide, waitForSlideDocument } from "./deckSlides.js";

export interface SlideLayoutIssue {
  kind: "overflow" | "overlap" | "format" | "export" | "resource";
  elements: string[];
  detail: string;
}
export interface SlideLayoutProgress {
  stage: "checking" | "repairing" | "passed" | "retained";
  attempt: number;
  issues: SlideLayoutIssue[];
}
interface TextBox {
  id: string;
  el: Element;
  rect: DOMRect;
}

/** 按真实字形测量，色块包住正文属于正常布局，不能按所有元素外框两两判重叠。 */
export async function auditSlideLayout(
  html: string,
  signal: AbortSignal,
): Promise<SlideLayoutIssue[]> {
  signal.throwIfAborted();
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.cssText =
    "position:fixed;left:-16000px;top:0;width:1280px;height:720px;border:0;pointer-events:none";
  try {
    await waitForSlideDocument(frame, prepareDeckHtml(html));
    signal.throwIfAborted();
    const doc = frame.contentDocument;
    if (!doc) throw new Error("无法检查页面版式");
    await doc.fonts.ready;
    signal.throwIfAborted();
    showSlide(doc, 0);
    presentSlide(doc);
    const issues: SlideLayoutIssue[] = [];
    const seen = new Set<string>();
    const boxes: TextBox[] = [];
    const visibleText: { id: string; text: string }[] = [];
    const add = (issue: SlideLayoutIssue) => {
      const key = `${issue.kind}:${issue.elements.join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(issue);
      }
    };
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const el = node.parentElement;
      if (!el || el.closest("script,style,[hidden]")) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const owner = el.closest("[data-pptx-id]") ?? el;
      const id = owner.getAttribute("data-pptx-id") ?? el.tagName.toLowerCase();
      const range = doc.createRange();
      range.selectNodeContents(node);
      const container = owner.getBoundingClientRect();
      if ([...range.getClientRects()].some((rect) => rect.width >= 1 && rect.height >= 1))
        visibleText.push({ id, text: node.textContent ?? "" });
      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;
        const bounds = `x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, w=${Math.round(rect.width)}, h=${Math.round(rect.height)}`;
        if (rect.left < -2 || rect.top < -2 || rect.right > 1282 || rect.bottom > 722) {
          add({ kind: "overflow", elements: [id], detail: `文字超出 1280×720 画布：${bounds}` });
        } else if (
          container.width > 0 &&
          container.height > 0 &&
          (rect.right > container.right + 3 || rect.bottom > container.bottom + 3)
        ) {
          add({ kind: "overflow", elements: [id], detail: `文字超出自身文本框：${bounds}` });
        }
        boxes.push({ id, el: owner, rect });
      }
    }
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i]!;
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j]!;
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (w > 3 && h > 3 && w * h > 24)
          add({
            kind: "overlap",
            elements: [a.id, b.id].sort(),
            detail: `文字相互重叠 ${Math.round(w)}×${Math.round(h)}px`,
          });
      }
    }
    // 预览正常不代表导出有正文；复用实际 PPTX 测量路径检查文本遗漏。
    for (const img of doc.images) {
      if (
        !img.getAttribute("src") ||
        img.getAttribute("src")?.includes("{{ILLUSTRATION}}") ||
        (img.complete && img.naturalWidth === 0)
      ) {
        add({
          kind: "resource",
          elements: [img.dataset.pptxId ?? "img"],
          detail:
            "图片资源未绑定或加载失败。没有可用配图时，请改用内联 SVG 或可编辑图形呈现内容，禁止保留图片占位符。",
        });
      }
    }
    const exported = await measureDeckPages([html]);
    signal.throwIfAborted();
    const compact = (text: string) => text.replace(/\s/gu, "");
    const exportedText = compact(
      exported
        .flatMap((page) =>
          page.nodes.filter((node) => node.kind === "text").map((node) => node.text ?? ""),
        )
        .join(""),
    );
    for (const item of visibleText) {
      const expected = compact(item.text);
      if (expected && !exportedText.includes(expected))
        add({
          kind: "export",
          elements: [item.id],
          detail: `PPTX 导出遗漏正文：${item.text.trim().slice(0, 100)}。请使用独立可编辑文本块保留该内容。`,
        });
    }
    return issues.slice(0, 12);
  } finally {
    frame.remove();
  }
}

class IncompleteSlideError extends Error {}

export function prepareSingleSlide(raw: string): string {
  const start = raw.search(/<!doctype\s+html|<html\b/iu);
  const end = raw.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || end < start)
    throw new IncompleteSlideError(
      "模型没有返回完整的单页 HTML，请重新输出包含完整正文和 </html> 的整个页面",
    );
  const doc = new DOMParser().parseFromString(raw.slice(start, end + 7), "text/html");
  for (const slide of doc.querySelectorAll("[data-pptx-slide]"))
    slide.removeAttribute("data-pptx-slide");
  doc.body.setAttribute("data-pptx-slide", "");
  return prepareDeckHtml(doc.documentElement.outerHTML);
}

export const SLIDE_LAYOUT_RULES = `Use 1280x720. Reserve x=48..1232 as the safe horizontal area, y=40..140 for the title, y=164..640 for the content, y=680..704 for one short footer. Leave at least 32px between columns and 20px between content blocks. Body text >=28px; footer >=15px. Keep code lines short enough to fit without clipping; use equivalent short variable names, semantic line breaks or columns. Never use tiny fonts, hidden overflow or text truncation to hide excess content. Use concise page-specific material rather than copying the whole deck brief onto every page.`;

export function retainedLayoutWarning(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.dataset.studioLayoutWarning ?? "";
}
function markLayoutWarning(html: string, issues: SlideLayoutIssue[]): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (issues.length)
    doc.body.dataset.studioLayoutWarning = issues
      .map((issue) => `${issue.elements.join(" / ")} ${issue.detail}`)
      .join("；");
  else delete doc.body.dataset.studioLayoutWarning;
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export async function ensureSlideLayout(input: {
  html: string;
  signal: AbortSignal;
  force?: boolean;
  theme?: DeckTheme;
  illustration?: string;
  onLayoutProgress?: (progress: SlideLayoutProgress) => void;
  evaluate?: (html: string, issues: SlideLayoutIssue[]) => Promise<unknown>;
  repair: (
    html: string,
    issues: SlideLayoutIssue[],
    attempt: number,
    rejectedOutput?: string,
    evaluation?: unknown,
  ) => Promise<string>;
}): Promise<string> {
  const normalize = (raw: string) => {
    const doc = new DOMParser().parseFromString(prepareSingleSlide(raw), "text/html");
    if (input.illustration)
      for (const img of doc.images)
        if (img.getAttribute("src") === "{{ILLUSTRATION}}")
          img.setAttribute("src", input.illustration);
    const html = doc.documentElement.outerHTML;
    return input.theme ? applyDeckTheme(html, input.theme) : html;
  };
  let raw = input.html;
  let lastComplete: string | undefined;
  // 按用户要求最多修复五次，仍有问题时保留完整候选，避免阻塞后续页面。
  for (let attempt = 0; ; attempt++) {
    input.signal.throwIfAborted();
    input.onLayoutProgress?.({ stage: "checking", attempt, issues: [] });
    let html: string | undefined;
    let issues: SlideLayoutIssue[] = [];
    // 格式错误也是可修复的模型输出，不能在 normalize 时绕过修复循环。
    try {
      html = normalize(raw);
    } catch (error) {
      if (!(error instanceof IncompleteSlideError)) throw error;
      issues = [{ kind: "format", elements: [], detail: error.message }];
    }
    if (html !== undefined) {
      lastComplete = html;
      issues = await auditSlideLayout(html, input.signal);
    }

    input.signal.throwIfAborted();
    if (!issues.length && !(input.force && attempt === 0)) {
      input.onLayoutProgress?.({ stage: "passed", attempt, issues: [] });
      return markLayoutWarning(html!, []);
    }
    if (attempt >= 5) {
      if (!lastComplete) throw new IncompleteSlideError("已修复 5 次，仍没有可保留的完整单页 HTML");
      const remaining =
        html === undefined
          ? [...issues, ...(await auditSlideLayout(lastComplete, input.signal))]
          : issues;
      input.signal.throwIfAborted();
      input.onLayoutProgress?.({ stage: "retained", attempt, issues: remaining });
      return markLayoutWarning(lastComplete, remaining);
    }
    input.onLayoutProgress?.({ stage: "repairing", attempt: attempt + 1, issues });
    // JEV 仅提供修复建议，最终验收仍由真实浏览器测量负责。
    const evaluation = html !== undefined ? await input.evaluate?.(html, issues) : undefined;
    input.signal.throwIfAborted();
    raw = await input.repair(
      lastComplete ?? raw,
      issues,
      attempt + 1,
      html === undefined ? raw : undefined,
      evaluation,
    );
  }
}

export async function repairStudioSlide(input: {
  html: string;
  apiKey: string;
  model: string;
  signal: AbortSignal;
  force?: boolean;
  theme?: DeckTheme;
  illustration?: string;
  contentContext?: string;
  reasoning?: Readonly<Record<string, unknown>>;
  onOutput: (text: string) => void;
  onRepair: () => void;
  onLayoutProgress?: (progress: SlideLayoutProgress) => void;
  onRetry?: (retry: StudioRetry) => void;
}): Promise<string> {
  const evaluator = useStudioRepairModelStore.getState().evaluatorModelId.trim();
  return ensureSlideLayout({
    ...input,
    evaluate: evaluator
      ? async (html, issues) => {
          input.onOutput(`正在评估版面：${evaluator}`);
          try {
            // 独立信号限制评估等待，用户取消必须透传，不能继续修复旧任务。
            const signal = AbortSignal.any([input.signal, AbortSignal.timeout(120_000)]);
            return await callZenMuxSystemOne(
              input.apiKey,
              {
                model: evaluator,
                state: { html, issues, contentContext: input.contentContext },
                questions: {
                  repair_priority: {
                    type: "choice",
                    instructions:
                      "选择此页最优先的版面修复策略。保留完整内容，不能通过隐藏、删除或缩小正文回避问题。",
                    criteria: {
                      reflow: "重新分配内容区域，修复重叠或越界",
                      hierarchy: "改善标题、正文与重点的视觉层级",
                      resources: "修复图片或导出资源",
                      preserve: "保持现有版面，仅修复本地检查报告的问题",
                    },
                  },
                  layout_quality: {
                    type: "score",
                    instructions:
                      "评估单页 PPT 的可读性、层级、空间布局与内容完整性；结合报告的问题，不得建议隐藏或删除内容。",
                  },
                },
              },
              undefined,
              (url, options) => fetch(url, { ...options, signal }),
            );
          } catch {
            input.signal.throwIfAborted();
            input.onOutput("版面评估暂不可用，继续本地检查和修复。");
            return undefined;
          }
        }
      : undefined,
    repair: async (html, issues, attempt, rejectedOutput, evaluation) => {
      input.onRepair();
      let reply = "";
      await streamStudioChat({
        apiKey: input.apiKey,
        model: input.model,
        reasoning: input.reasoning,
        signal: input.signal,
        requireComplete: true,
        contentOnly: true,
        maxTokens: 12000,
        messages: [
          {
            role: "system",
            content: `Repair the layout of this single editable slide. Return a complete HTML document only. Preserve all facts, existing element IDs and valid image sources. For reported resource failures, replace unavailable images with an equivalent inline SVG or editable diagram; never invent image URLs. Improve hierarchy and spacing. Do not add slides. Keep the supplied theme ${JSON.stringify(input.theme ?? {})}. ${SLIDE_LAYOUT_RULES}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              attempt,
              rejectedOutput,
              evaluation,
              contentContext: input.contentContext,
              guidance:
                attempt > 2
                  ? "Previous repairs did not resolve the layout. Replan all content regions with explicit non-overlapping bounds; preserve facts and IDs. Do not hide or delete content to pass validation."
                  : "Resolve every reported issue.",
              issues,
              html,
            }),
          },
        ],
        onAttempt: () => {
          reply = "";
          input.onOutput("");
        },
        onRetry: input.onRetry,
        onDelta: (delta) => {
          if (!input.signal.aborted) {
            reply += delta;
            input.onOutput(reply);
          }
        },
      });
      input.signal.throwIfAborted();
      return reply;
    },
  });
}
