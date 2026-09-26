import { resolveStudioRepairModel } from "@/store/studioRepairModelStore.js";
import { retainedLayoutWarning } from "./studioSlideLayout.js";
/* oxlint-disable eslint(max-lines) -- 创作面板同时放讨论、手绘、结果和 PPT。 */
/**
 * 生图、生视频和带插图 PPT。讨论按顺序往下流出，不画节点流图。
 */
import { useRef, useState } from "react";
import { isApiKeyAccess } from "@zcode/provider";
import type { ModelSelectionView } from "@zcode/services";
import { isZenMuxSystemOneModel } from "@zcode/shared";
import { MessageResponse } from "@/components/ai-elements/message.js";
import { Button } from "@/components/ui/button.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { readDeckAttachmentText } from "./deckAttachmentText.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  blobFromUrl,
  editStudioImage,
  generateStudioImage,
  generateStudioVideo,
} from "./mediaClient.js";
import { readStudioImageModel, studioImageModelById } from "./studioImageModels.js";
import { readStudioVideoModel, videoCatalogEntry } from "./studioMediaStore.js";
import {
  buildEditableDeckPptx,
  describeElements,
  measureDeckPages,
  parseElementEdits,
  replaceDeckElements,
} from "./htmlToEditablePptx.js";
import { SketchPad, ZoomPanImage, type SketchPadHandle } from "./SketchPad.js";
import { streamStudioChat, type StudioRetry } from "./studioChatRetry.js";
import { generateStudioDeck } from "./studioPptGenerate.js";
import { applyDeckTheme, deckThemeForStyle } from "./deckTheme.js";
import { repairStudioSlide } from "./studioSlideLayout.js";
import { applyDeckGeometry } from "./useSlideGeometry.js";
import { SlideDeckView } from "./SlideDeckView.js";
import { modelEfforts, reasoningBody, resolveEffort } from "../reasoningEffort.js";
import { thoughtLevelLabelId } from "@/chat-input-toolbar/thoughtLevelOptions.js";

type StudioMode = "image" | "video" | "ppt";
type PptMode = "guided" | "chat";

interface Speech {
  name: string;
  text: string;
}

const COUNCIL = [
  { name: "意图", duty: "说清对象、动作和限制。用短段落，不要画流程图。" },
  { name: "美术", duty: "补风格、构图、颜色和光线。用短段落，不要画流程图。" },
  { name: "挑刺", duty: "指出含糊和容易画错的地方。用短段落，不要画流程图。" },
  { name: "成稿", duty: "综合前面的意见。最后一行以 FINAL: 开头，写出可直接交给生成器的提示词。" },
] as const;

function readApiKey(view: ModelSelectionView | null): string {
  for (const provider of view?.providers ?? []) {
    const access = provider.config.access;
    if (isApiKeyAccess(access) && access.apiKey?.trim()) return access.apiKey.trim();
  }
  return "";
}

const PPT_MODEL_KEY = "zencode.studio.pptModel";
const INTENT_MODEL_KEY = "zencode.studio.intentModel";
const EFFORT_KEY = "zencode.studio.efforts.v1";

function readEffortMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(EFFORT_KEY) ?? "{}") as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeEffort(modelId: string, effort: string): Record<string, string> {
  const next = { ...readEffortMap(), [modelId]: effort };
  try {
    localStorage.setItem(EFFORT_KEY, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
}

function chatModelIds(view: ModelSelectionView | null): string[] {
  // typesafe/jev-1.13 只走 System One 判断，不能进 chat completions。
  const ids = (view?.providers ?? []).flatMap((provider) =>
    provider.models
      .map((model) => model.modelId)
      .filter((id) => id.trim() && !isZenMuxSystemOneModel(id)),
  );
  return [...new Set(ids)];
}

function readStoredModel(key: string, ids: readonly string[]): string {
  let stored = "";
  try {
    stored = localStorage.getItem(key) ?? "";
  } catch {
    stored = "";
  }
  if (stored && ids.includes(stored)) return stored;
  return ids[0] ?? "openai/gpt-6-sol";
}

function listedModel(view: ModelSelectionView | null, selected: string, key: string): string {
  const ids = chatModelIds(view);
  if (selected && ids.includes(selected)) return selected;
  return readStoredModel(key, ids);
}

/** 被点名的模型这一轮不担任其他角色。没有其他模型时仍用它们，避免讨论停住。 */
function councilModels(view: ModelSelectionView | null, exclude: readonly string[]): string[] {
  const ids = chatModelIds(view);
  const blocked = new Set(exclude.filter((id) => id.trim()));
  const rest = ids.filter((id) => !blocked.has(id));
  if (rest.length > 0) return rest;
  return ids.length > 0 ? ids : ["openai/gpt-6-sol"];
}

function persistModel(key: string, id: string): void {
  try {
    localStorage.setItem(key, id);
  } catch {
    // 隐私模式写不进去时，这一轮仍用组件里的选择。
  }
}

const PROMPT_LIBRARY_KEY = "zencode.studio.prompts.v1";
const PPT_PAGE_COUNTS = [5, 8, 10, 12, 15, 20] as const;
const DECK_READABILITY =
  "硬性规则，和用户要求一起遵守，不能为了版式省掉：深色底上的字必须是浅色 #f7f4ef，浅色底上的字必须是深色 #1c1917。按文字所在色块的背景判断，不要按整页底色。代码块、pre、code 以及里面每一层都要写上 color，禁止 color:inherit，禁止黑色或深色字落在深蓝、深灰代码块上。有代码、分支、对比或步骤的每一页必须有一块内联 svg 示意图，放在空白处，不要盖住文字。整份文稿最多一张照片，不能用这张照片代替这些示意图。";
const PROMPT_LIBRARY_LIMIT = 30;

interface SavedPrompt {
  text: string;
  kind: StudioMode;
}

interface ReferenceImage {
  id: string;
  url: string;
}

interface DeckFile {
  id: string;
  name: string;
  text: string;
}

function readPromptLibrary(): SavedPrompt[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROMPT_LIBRARY_KEY) ?? "[]") as SavedPrompt[];
    return Array.isArray(parsed) ? parsed.filter((item) => item.text?.trim()) : [];
  } catch {
    return [];
  }
}

function forgetPrompts(texts: readonly string[]): SavedPrompt[] {
  const drop = new Set(texts);
  const next = readPromptLibrary().filter((item) => !drop.has(item.text));
  try {
    localStorage.setItem(PROMPT_LIBRARY_KEY, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
}

function rememberPrompt(kind: StudioMode, text: string): SavedPrompt[] {
  const trimmed = text.trim();
  if (!trimmed) return readPromptLibrary();
  const next = [
    { text: trimmed, kind },
    ...readPromptLibrary().filter((item) => item.text !== trimmed),
  ].slice(0, PROMPT_LIBRARY_LIMIT);
  try {
    localStorage.setItem(PROMPT_LIBRARY_KEY, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
}

function strokeInstruction(keepColor: boolean, sketchOnly: boolean): string {
  const colors = keepColor
    ? "不同颜色表示各部分自己的颜色或各自的修改，不要收成一种颜色。"
    : "笔迹颜色只作标记，成图颜色按用户文字来。";
  if (sketchOnly) {
    return `这是手绘草图，或上一轮仍按手绘画出来的结果。线条只说明主体、构图、位置和这次要改的内容，不是要保留的画材。除非用户原文明确写出要手绘、线稿、素描或涂鸦，否则整张必须是自然照片：真实光影和材质，禁止彩铅、蜡笔、纸纹和插画，不要把线条描出来。${colors}`;
  }
  return keepColor
    ? `参考图上的笔迹必须保留各自原来的颜色，不要把不同颜色收成一种颜色。没画到的地方保持原样。除非用户原文明确写出要手绘、线稿、素描或涂鸦，否则改过的部分也必须是自然照片，不要描成铅笔画。${colors}`
    : `彩色笔迹只标出修改范围，可以按文字改掉笔迹的颜色。没画到的地方保持原样。除非用户原文明确写出要手绘、线稿、素描或涂鸦，否则改过的部分也必须是自然照片，不要描成铅笔画。`;
}

function finalLine(text: string): string {
  const lines = text
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.startsWith("FINAL:"));
  return lines[lines.length - 1]?.replace(/^FINAL:\s*/u, "").trim() ?? "";
}

function finalPrompt(speeches: readonly Speech[], fallback: string): string {
  return finalLine(speeches[speeches.length - 1]?.text ?? "") || fallback;
}

/** 成稿写 ILLUSTRATE: none 表示不配图。没写这一行时，按需要配图处理。 */
function illustrationPrompt(speeches: readonly Speech[], fallback: string): string | null {
  const last = speeches[speeches.length - 1]?.text ?? "";
  const line = last.split("\n").find((item) => /^ILLUSTRATE:/iu.test(item.trim()));
  if (!line) return fallback;
  const value = line.replace(/^ILLUSTRATE:\s*/iu, "").trim();
  if (!value || /^(none|无|不需要|无需配图)$/iu.test(value)) return null;
  return value;
}

function extractSvg(text: string): string | null {
  const fenced = text.match(/```svg\s*([\s\S]*?)```/iu);
  if (fenced?.[1]?.includes("<svg")) return fenced[1].trim();
  const raw = text.match(/<svg[\s\S]*<\/svg>/iu);
  return raw?.[0]?.trim() ?? null;
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 委员会决定配图方式：生图、内嵌 SVG，或不配图。 */
function pictureDecision(
  speeches: readonly Speech[],
  fallback: string,
): { kind: "image"; prompt: string } | { kind: "svg"; svg: string } | { kind: "none" } {
  const last = speeches[speeches.length - 1]?.text ?? "";
  const medium = last.split("\n").find((item) => /^MEDIUM:/iu.test(item.trim()));
  const value =
    medium
      ?.replace(/^MEDIUM:\s*/iu, "")
      .trim()
      .toLowerCase() ?? "";
  if (value.startsWith("none") || value.startsWith("无")) return { kind: "none" };
  if (value.startsWith("svg")) {
    const svg = extractSvg(last);
    return svg ? { kind: "svg", svg } : { kind: "image", prompt: fallback };
  }
  const prompt = illustrationPrompt(speeches, fallback);
  if (!prompt) return { kind: "none" };
  return { kind: "image", prompt };
}

function ModelPick({
  label,
  value,
  ids,
  efforts,
  effort,
  onChange,
  onEffort,
  effortAria,
  effortLabel,
}: {
  label: string;
  value: string;
  ids: readonly string[];
  efforts: readonly string[];
  effort: string;
  onChange: (id: string) => void;
  onEffort: (effort: string) => void;
  effortAria: string;
  effortLabel: (effort: string) => string;
}) {
  return (
    <label className="flex items-center gap-1 text-ui-caption">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 max-w-56 rounded-lg border border-border bg-background px-2"
      >
        {(ids.length > 0 ? ids : [value]).map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      {efforts.length > 0 ? (
        <select
          aria-label={effortAria}
          value={effort}
          onChange={(event) => onEffort(event.target.value)}
          className="h-7 rounded-lg border border-border bg-background px-2"
        >
          {efforts.map((item) => (
            <option key={item} value={item}>
              {effortLabel(item)}
            </option>
          ))}
        </select>
      ) : null}
    </label>
  );
}

export function StudioPanel({
  modelSelectionView,
}: {
  modelSelectionView: ModelSelectionView | null;
}) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const apiKey = readApiKey(modelSelectionView);
  const sketchRef = useRef<SketchPadHandle>(null);
  const [mode, setMode] = useState<StudioMode>("image");
  const [pptMode, setPptMode] = useState<PptMode>("guided");
  const [prompt, setPrompt] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [deckStyle, setDeckStyle] = useState("杂志风");
  const [extraNote, setExtraNote] = useState("");
  const [pptModelId, setPptModelId] = useState(() =>
    readStoredModel(PPT_MODEL_KEY, chatModelIds(modelSelectionView)),
  );
  const [intentModelId, setIntentModelId] = useState(() =>
    readStoredModel(INTENT_MODEL_KEY, chatModelIds(modelSelectionView)),
  );
  const [effortMap, setEffortMap] = useState<Record<string, string>>(() => readEffortMap());
  const [pagesChoice, setPagesChoice] = useState("10");
  const [customPages, setCustomPages] = useState("12");
  const [color, setColor] = useState("#e11d48");
  const [keepStrokeColor, setKeepStrokeColor] = useState(true);
  const [stroke, setStroke] = useState(8);
  const [erase, setErase] = useState(false);
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [deckFiles, setDeckFiles] = useState<DeckFile[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fromSketch, setFromSketch] = useState(false);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [generatingDeck, setGeneratingDeck] = useState(false);
  const [deckPages, setDeckPages] = useState<string[]>([]);
  const [deckPage, setDeckPage] = useState(0);
  const deckHtml = deckPages[deckPage] ?? "";
  const [deckProgress, setDeckProgress] = useState("");
  const [deckOutput, setDeckOutput] = useState("");
  const [editOutput, setEditOutput] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [elementNote, setElementNote] = useState("");
  const [elementImages, setElementImages] = useState<ReferenceImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<SavedPrompt[]>(() => readPromptLibrary());
  const [pickedPrompts, setPickedPrompts] = useState<string[]>([]);
  const [imageRatio, setImageRatio] = useState("");
  const [videoRatio, setVideoRatio] = useState("");
  const [videoSeconds, setVideoSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const retryLabel = (retry: StudioRetry) =>
    intl.formatMessage(
      { id: "chat.studio.retry" },
      {
        attempt: retry.attempt,
        max: retry.maxAttempts,
        seconds: Math.ceil(retry.delayMs / 1000),
      },
    );

  const discuss = async (
    task: string,
    signal: AbortSignal,
    prior: Speech[] = [],
    namePrefix = "",
    images: readonly string[] = [],
    excludeModel?: string,
  ) => {
    const intent = listedModel(modelSelectionView, intentModelId, INTENT_MODEL_KEY);
    const roster = councilModels(modelSelectionView, [excludeModel ?? "", intent]);
    const spoken: Speech[] = prior.map((item) => ({ ...item }));
    let otherIndex = 0;
    for (const agent of COUNCIL) {
      const model =
        agent.name === "意图" ? intent : (roster[otherIndex++ % roster.length] ?? intent);
      const effort = resolveEffort(effortMap[model] ?? "", modelEfforts(modelSelectionView, model));
      let reply = "";
      const speaker = `${namePrefix}${agent.name} · ${model}`;
      spoken.push({ name: speaker, text: "" });
      setSpeeches([...spoken]);
      const history = spoken
        .slice(0, -1)
        .map((item) => `${item.name}：\n${item.text}`)
        .join("\n\n");
      const promptText = history ? `${task}\n\n已有讨论：\n${history}` : task;
      const agentAbort = new AbortController();
      const abortAgent = () => agentAbort.abort();
      signal.addEventListener("abort", abortAgent);
      let finishEarly: (() => void) | undefined;
      const earlyDone = new Promise<void>((resolve) => {
        finishEarly = resolve;
      });
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const streamTask = streamStudioChat({
        requireComplete: true,
        onAttempt: () => {
          reply = "";
          spoken[spoken.length - 1] = { name: speaker, text: "" };
          setSpeeches([...spoken]);
        },
        onRetry: (retry) => {
          if (signal.aborted) return;
          clearTimeout(idleTimer);
          spoken[spoken.length - 1] = { name: speaker, text: retryLabel(retry) };
          setSpeeches([...spoken]);
        },
        apiKey,
        model,
        messages: [
          {
            role: "system",
            content: `你是${agent.name}。${agent.duty} 用户消息里的图片就是参考图，直接看图，不要要求再上传。`,
          },
          {
            role: "user",
            content:
              images.length === 0
                ? promptText
                : [
                    { type: "text", text: `${promptText}\n参考图已附在本条消息中。` },
                    ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
                  ],
          },
        ],
        reasoning: reasoningBody(model, effort),
        signal: agentAbort.signal,
        onDelta: (delta) => {
          if (signal.aborted) return;
          reply += delta;
          spoken[spoken.length - 1] = { name: speaker, text: reply };
          setSpeeches([...spoken]);
          if (agent.name === "成稿" && finalLine(reply)) {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => finishEarly?.(), 1200);
          }
        },
      }).catch((streamError: unknown) => {
        if (agentAbort.signal.aborted || signal.aborted) return;
        throw streamError;
      });
      try {
        await Promise.race([streamTask, earlyDone]);
      } finally {
        clearTimeout(idleTimer);
        signal.removeEventListener("abort", abortAgent);
        agentAbort.abort();
      }
      if (signal.aborted) throw new DOMException("讨论已取消", "AbortError");
    }
    return spoken;
  };

  const runMedia = async () => {
    if (!apiKey || !prompt.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setSpeeches([]);
    try {
      const { images, marked } = await collectImages();
      const imageUrls = await Promise.all(images.map((blob) => blobToDataUrl(blob)));
      const sketchOnly =
        (!imageUrl && references.length === 0) || (fromSketch && references.length === 0);
      const spoken = await discuss(
        images.length > 0
          ? `${prompt.trim()}\n除了这段文字，还附有参考图。${marked ? strokeInstruction(keepStrokeColor, sketchOnly) : "参考图里的主体必须保留。"}`
          : prompt.trim(),
        controller.signal,
        [],
        "",
        imageUrls,
      );
      const optimized = finalPrompt(spoken, prompt.trim());
      const instruction = marked
        ? `${optimized}\n${strokeInstruction(keepStrokeColor, sketchOnly)}`
        : images.length > 0
          ? `${optimized}\n附图是参照，不要忽略图里的主体。`
          : optimized;
      if (mode === "video") {
        const image = images[0] ? await blobToInline(images[0]) : null;
        setVideoUrl(
          await generateStudioVideo(apiKey, instruction, image, controller.signal, {
            ratio: activeVideoRatio,
            seconds: activeVideoSeconds,
          }),
        );
      } else {
        const next = await generateStudioImage(
          apiKey,
          instruction,
          readStudioImageModel(),
          images,
          activeImageRatio,
        );
        setFromSketch(references.length === 0 && (sketchOnly || !imageUrl));
        setImageUrl(next);
        setOutputUrl(next);
        if (marked) sketchRef.current?.clear();
      }
      setLibrary(rememberPrompt(mode, optimized));
    } catch (runError) {
      if (!controller.signal.aborted) {
        setError(runError instanceof Error ? runError.message : String(runError));
      }
    } finally {
      if (abortRef.current === controller) setBusy(false);
    }
  };

  const runPpt = async () => {
    if (!apiKey) return;
    const pageTotal =
      pagesChoice === "custom"
        ? Math.min(40, Math.max(1, Math.round(Number(customPages) || 10)))
        : Number(pagesChoice);
    const source = deckFiles
      .map((file) =>
        file.text
          ? `附件 ${file.name} 的正文如下，必须按正文写，不要说没提供正文：\n${file.text}`
          : `附件 ${file.name}`,
      )
      .join("\n\n");
    const note = extraNote.trim();
    const brief = `${pptMode === "guided" ? `主题：${topic}\n受众：${audience}\n风格：${deckStyle}` : prompt.trim()}${note ? `\n附加要求：${note}` : ""}${source ? `\n\n${source}` : ""}`;
    if (!brief.trim()) return;
    const writer = listedModel(modelSelectionView, pptModelId, PPT_MODEL_KEY);
    const repairModel = resolveStudioRepairModel(writer);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setGeneratingDeck(true);
    setError(null);
    setDeckPages([]);
    setDeckPage(0);
    setDeckProgress("");
    setDeckOutput("");
    setEditOutput("");
    setEditStatus("");
    setSelectedIds([]);
    setSpeeches([]);
    let completedPageCount = 0;
    try {
      const collected = await collectImages();
      const imageUrls = await Promise.all(collected.images.map((blob) => blobToDataUrl(blob)));
      const spoken = await discuss(
        `为一份正好 ${pageTotal} 页的可编辑幻灯片讨论内容和视觉风格。系统随后先生成 JSON 目录，再逐页生成独立的 1280×720 页面。不要提出单文件网页、其他画布尺寸或输出整份 HTML 的要求。${brief}\n成稿在 FINAL: 之后另起一行写 MEDIUM:。需要一张照片或实景写 MEDIUM: image，并再写一行 ILLUSTRATE: 画面提示。不需要照片写 MEDIUM: none。流程图、分支和步骤由页面自己画，不要收成一整份文稿的一张 SVG。${DECK_READABILITY}`,
        controller.signal,
        [],
        "",
        imageUrls,
        writer,
      );
      const decision = pictureDecision(
        spoken,
        `一张没有文字的 PPT 插图。${finalPrompt(spoken, brief)}`,
      );
      let picture = imageUrl;
      if (!picture && decision.kind === "image") {
        const imageTalk = await discuss(
          `这次只讨论生图，不要输出 SVG。最后一行 FINAL: 是交给生图模型的提示词。画面要求：${decision.prompt}`,
          controller.signal,
          spoken,
          "配图·",
          imageUrls,
          writer,
        );
        const illustrated = finalPrompt(imageTalk, decision.prompt);
        picture = await generateStudioImage(
          apiKey,
          collected.marked
            ? `${illustrated}\n${strokeInstruction(keepStrokeColor, references.length === 0)}`
            : illustrated,
          readStudioImageModel(),
          collected.images,
          activeImageRatio,
        );
        setImageUrl(picture);
      } else if (!picture && decision.kind === "svg") {
        picture = svgDataUrl(decision.svg);
        setImageUrl(picture);
      }
      await generateStudioDeck({
        apiKey,
        model: writer,
        repairModel,
        repairReasoning: reasoningBody(
          repairModel,
          resolveEffort(
            effortMap[repairModel] ?? "",
            modelEfforts(modelSelectionView, repairModel),
          ),
        ),
        illustration: picture || undefined,
        pageCount: pageTotal,
        styleHint: deckStyle,
        brief,
        discussion: spoken.map((item) => `${item.name}：${item.text}`).join("\n\n"),
        signal: controller.signal,
        reasoning: reasoningBody(
          writer,
          resolveEffort(effortMap[writer] ?? "", modelEfforts(modelSelectionView, writer)),
        ),
        onLayoutProgress: (progress, page, total) => {
          if (abortRef.current !== controller || controller.signal.aborted) return;
          setDeckProgress(
            intl.formatMessage(
              { id: `chat.studio.layout.${progress.stage}` },
              { attempt: progress.attempt, count: progress.issues.length, page, total },
            ) +
              (progress.issues.length
                ? ` · ${progress.issues.map((issue) => `${issue.elements.join(" / ")} ${issue.detail}`).join("；")}`
                : ""),
          );
        },
        onProgress: (phase, page, total) => {
          if (abortRef.current !== controller || controller.signal.aborted) return;
          setDeckProgress(
            intl.formatMessage({ id: `chat.studio.phase.${phase}` }, { page, total }),
          );
          setDeckOutput("");
        },
        onRetry: (retry) => {
          if (abortRef.current !== controller || controller.signal.aborted) return;
          setDeckProgress(
            `${intl.formatMessage({ id: `chat.studio.phase.${retry.phase}` }, { page: retry.page, total: retry.total })} · ${retryLabel(retry)}`,
          );
        },
        onOutput: (text) => {
          if (abortRef.current === controller && !controller.signal.aborted) setDeckOutput(text);
        },
        onPage: (pages) => {
          if (abortRef.current !== controller || controller.signal.aborted) return;
          completedPageCount = pages.length;
          // 每页保持独立文档，避免同名 CSS 和绝对定位把多页叠到同一画布。
          // 后续页完成只追加；已经拖动/缩放过的页面不能被生成器旧快照覆盖。
          setDeckPages(current => pages.map((page,index) => current[index] ?? page));
        },
      });
      if (abortRef.current !== controller || controller.signal.aborted) return;
      setDeckProgress(intl.formatMessage({ id: "chat.studio.phase.done" }, { total: pageTotal }));
      setLibrary(rememberPrompt("ppt", finalPrompt(spoken, brief)));
    } catch (runError) {
      if (abortRef.current === controller && !controller.signal.aborted) {
        setDeckProgress(
          intl.formatMessage({
            id: completedPageCount ? "chat.studio.phase.failed" : "chat.studio.phase.failedEmpty",
          }),
        );
        setError(runError instanceof Error ? runError.message : String(runError));
      }
    } finally {
      if (abortRef.current === controller) { setBusy(false); setGeneratingDeck(false); }
    }
  };

  const reviseMarked = async () => {
    if (!apiKey || !imageUrl) return;
    const sketch = sketchRef.current?.hasInk()
      ? await sketchRef.current.exportMarked(await blobFromUrl(imageUrl))
      : null;
    if (!sketch) {
      setError(intl.formatMessage({ id: "chat.studio.markFirst" }));
      return;
    }
    const previous = imageUrl;
    const note = prompt.trim();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setSpeeches([]);
    try {
      const rule = strokeInstruction(keepStrokeColor, fromSketch && references.length === 0);
      const spoken = await discuss(
        `按手绘标记修改当前这张图。${rule}${note ? `用户补充：${note}。` : ""}最后一行 FINAL: 只写画面内容。除非用户原文明确要求，不要在 FINAL 里要求保留手绘、彩铅或插画。`,
        controller.signal,
        [],
        "改图·",
        [await blobToDataUrl(sketch)],
      );
      const optimized = finalPrompt(
        spoken,
        "按手绘标记修改画面。除非用户明确要求手绘，否则输出自然照片。",
      );
      const next = await editStudioImage(apiKey, sketch, `${optimized}\n${rule}`, activeImageRatio);
      setDeckPages((current) => current.map((page) => page.split(previous).join(next)));
      setImageUrl(next);
      setOutputUrl(next);
      sketchRef.current?.clear();
      setLibrary(rememberPrompt("image", optimized));
    } catch (runError) {
      if (!controller.signal.aborted) {
        setError(runError instanceof Error ? runError.message : String(runError));
      }
    } finally {
      if (abortRef.current === controller) setBusy(false);
    }
  };

  const repairCurrentLayout = async () => {
    if (busy || !apiKey || !deckHtml) return;
    const source = deckHtml,
      target = deckPage;
    const writer = resolveStudioRepairModel(
      listedModel(modelSelectionView, pptModelId, PPT_MODEL_KEY),
    );
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setDeckOutput("");
    setSelectedIds([]);
    setDeckProgress(
      intl.formatMessage(
        { id: "chat.studio.phase.layout" },
        { page: target + 1, total: deckPages.length },
      ),
    );
    try {
      const html = await repairStudioSlide({
        html: source,
        force: true,
        theme: deckThemeForStyle(deckStyle),
        apiKey,
        model: writer,
        signal: controller.signal,
        reasoning: reasoningBody(
          writer,
          resolveEffort(effortMap[writer] ?? "", modelEfforts(modelSelectionView, writer)),
        ),
        onRepair: () => {},
        onLayoutProgress: (progress) => {
          if (abortRef.current !== controller || controller.signal.aborted) return;
          setDeckProgress(
            intl.formatMessage(
              { id: `chat.studio.layout.${progress.stage}` },
              {
                attempt: progress.attempt,
                count: progress.issues.length,
                page: target + 1,
                total: deckPages.length,
              },
            ) +
              (progress.issues.length
                ? ` · ${progress.issues.map((issue) => `${issue.elements.join(" / ")} ${issue.detail}`).join("；")}`
                : ""),
          );
        },

        onOutput: (text) => {
          if (abortRef.current === controller && !controller.signal.aborted) setDeckOutput(text);
        },
        onRetry: (retry) => {
          if (abortRef.current === controller && !controller.signal.aborted)
            setDeckProgress(retryLabel(retry));
        },
      });
      if (abortRef.current !== controller || controller.signal.aborted) return;
      setDeckPages((pages) =>
        pages.map((page, index) => (index === target && page === source ? html : page)),
      );
      setDeckProgress(
        intl.formatMessage({
          id: retainedLayoutWarning(html) ? "chat.studio.layoutKept" : "chat.studio.layoutDone",
        }),
      );
    } catch (error) {
      if (abortRef.current === controller && !controller.signal.aborted) {
        setError(error instanceof Error ? error.message : String(error));
        setDeckProgress(intl.formatMessage({ id: "chat.studio.edit.failed" }));
      }
    } finally {
      if (abortRef.current === controller) setBusy(false);
    }
  };

  const saveDeck = async () => {
    if (!platform.saveFile) {
      setError("无法保存 PPT");
      return;
    }
    try {
      const pages = await measureDeckPages(deckPages);
      if (!pages.some((page) => page.nodes.some((node) => node.kind === "text"))) {
        setError("幻灯片里没有可编辑的文字");
        return;
      }
      const bytes = await buildEditableDeckPptx(pages);
      const data = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(data).set(bytes);
      const result = await platform.saveFile({
        data,
        suggestedName: "zencode-deck.pptx",
      });
      if (!result.success && result.error) setError(result.error);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "无法保存 PPT");
    }
  };

  const editSelection = async () => {
    if (!apiKey || selectedIds.length === 0) {
      setError(intl.formatMessage({ id: "chat.studio.pickElements" }));
      return;
    }
    const note = elementNote.trim();
    if (!note) {
      setError(intl.formatMessage({ id: "chat.studio.elementNeedPrompt" }));
      return;
    }
    const writer = listedModel(modelSelectionView, pptModelId, PPT_MODEL_KEY);
    const targetPage = deckPage;
    const targetIds = [...selectedIds];
    const pasted = await Promise.all(
      elementImages.map(async (item) => blobToDataUrl(await blobFromUrl(item.url))),
    );
    const placeholders = pasted.map((_, pasteIndex) => `{{PASTE_${pasteIndex}}}`).join("、");
    const request = `${note}${placeholders ? `\n附图按顺序对应 ${placeholders}。要把某张附图放进元素，img 的 src 必须写对应占位符。` : ""}`;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      setEditOutput("");
      setEditStatus(intl.formatMessage({ id: "chat.studio.edit.waiting" }));
      const context = describeElements(deckHtml, targetIds);
      let reply = "";
      await streamStudioChat({
        requireComplete: true,
        onAttempt: () => {
          reply = "";
          setEditOutput("");
          setEditStatus(intl.formatMessage({ id: "chat.studio.edit.waiting" }));
        },
        onRetry: (retry) => {
          if (abortRef.current === controller && !controller.signal.aborted)
            setEditStatus(retryLabel(retry));
        },
        contentOnly: true,
        apiKey,
        model: writer,
        reasoning: reasoningBody(
          writer,
          resolveEffort(effortMap[writer] ?? "", modelEfforts(modelSelectionView, writer)),
        ),
        messages: [
          {
            role: "system",
            content: `你只修改用户选中的幻灯片元素。只输出 JSON 数组，每项是 {"id","html"}。html 是替换后的完整元素，保留原来的 data-pptx-id 和 data-pptx-kind。不要改未列出的元素，不要输出整页。要换图片时，img 的 src 写成 {{NEW_IMAGE}}。用户附图用 {{PASTE_0}} 起的占位符，不要编造图片地址。若选中的是流程图，替换成一个完整 svg，data-pptx-kind 仍为 image。正文不要小于 28px，文字必须留在色块里面，不要让一行末尾只剩几个字。${DECK_READABILITY}`,
          },
          {
            role: "user",
            content:
              pasted.length === 0
                ? `${request}\n\n选中元素：\n${context}`
                : [
                    { type: "text", text: `${request}\n\n选中元素：\n${context}` },
                    ...pasted.map((url) => ({ type: "image_url" as const, image_url: { url } })),
                  ],
          },
        ],
        signal: controller.signal,
        onDelta: (delta) => {
          if (abortRef.current !== controller || controller.signal.aborted) return;
          reply += delta;
          setEditOutput(reply);
          setEditStatus(intl.formatMessage({ id: "chat.studio.edit.streaming" }));
        },
      });
      if (abortRef.current !== controller || controller.signal.aborted) return;
      const edits = parseElementEdits(reply).filter((edit) => targetIds.includes(edit.id));
      if (edits.length === 0) {
        throw new Error(intl.formatMessage({ id: "chat.studio.elementEditFailed" }));
      }
      let nextHtml = replaceDeckElements(deckHtml, edits);
      pasted.forEach((url, pasteIndex) => {
        nextHtml = nextHtml.replaceAll(`{{PASTE_${pasteIndex}}}`, url);
      });
      if (nextHtml.includes("{{NEW_IMAGE}}")) {
        const spoken = await discuss(
          `只为选中的图片换一张。用户要求：${note}。最后一行 FINAL: 是交给生图模型的提示词。`,
          controller.signal,
          [],
          "",
          pasted,
          writer,
        );
        const picture = await generateStudioImage(
          apiKey,
          finalPrompt(spoken, note),
          readStudioImageModel(),
          await Promise.all(elementImages.map((item) => blobFromUrl(item.url))),
          activeImageRatio,
        );
        nextHtml = nextHtml.replaceAll("{{NEW_IMAGE}}", picture);
        setImageUrl(picture);
        setOutputUrl(picture);
      }
      if (abortRef.current !== controller || controller.signal.aborted) return;
      setDeckPages((pages) => pages.map((page, index) => (index === targetPage ? nextHtml : page)));
      setEditStatus(intl.formatMessage({ id: "chat.studio.edit.done" }));
    } catch (editError) {
      if (abortRef.current === controller && !controller.signal.aborted) {
        setEditStatus(intl.formatMessage({ id: "chat.studio.edit.failed" }));
        setError(
          editError instanceof Error
            ? editError.message
            : intl.formatMessage({ id: "chat.studio.elementEditFailed" }),
        );
      }
    } finally {
      if (abortRef.current === controller) setBusy(false);
    }
  };

  const copyImage = () => {
    if (!imageUrl || typeof navigator === "undefined" || !navigator.clipboard?.write) {
      setError("无法拷贝图片");
      return;
    }
    const url = imageUrl;
    const item = new ClipboardItem({
      "image/png": blobFromUrl(url).then((blob) => imagePngBlob(blob)),
    });
    void navigator.clipboard.write([item]).catch((copyError: unknown) => {
      setError(copyError instanceof Error ? copyError.message : "无法拷贝图片");
    });
  };

  const saveImage = async () => {
    if (!imageUrl || !platform.saveFile) {
      setError("无法保存图片");
      return;
    }
    try {
      const blob = await blobFromUrl(imageUrl);
      const result = await platform.saveFile({
        data: await blob.arrayBuffer(),
        suggestedName: `zencode-image.${imageExtension(blob.type)}`,
      });
      if (!result.success && result.error) setError(result.error);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "无法保存图片");
    }
  };

  const addDeckFiles = async (files: Iterable<File>) => {
    const next: DeckFile[] = [];
    for (const file of files) {
      if (file.type.startsWith("image/")) continue;
      const text = await readDeckAttachmentText(file);
      if (!text) setError(`${file.name || "附件"} 没能读出正文`);
      next.push({ id: crypto.randomUUID(), name: file.name || "attachment", text });
    }
    if (next.length === 0) return;
    setDeckFiles((current) => [...current, ...next]);
  };

  const addElementImages = (files: Iterable<File>) => {
    const next = [...files]
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({ id: crypto.randomUUID(), url: URL.createObjectURL(file) }));
    if (next.length === 0) return;
    setElementImages((current) => [...current, ...next]);
  };

  const removeElementImage = (id: string) => {
    setElementImages((current) => {
      const found = current.find((item) => item.id === id);
      if (found?.url.startsWith("blob:")) URL.revokeObjectURL(found.url);
      return current.filter((item) => item.id !== id);
    });
  };

  const addReferenceFiles = (files: Iterable<File>) => {
    const next = [...files]
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({ id: crypto.randomUUID(), url: URL.createObjectURL(file) }));
    if (next.length === 0) return;
    setReferences((current) => [...current, ...next]);
  };

  const imageFiles = (data: DataTransfer | null): File[] => {
    if (!data) return [];
    const fromFiles = [...data.files].filter((file) => file.type.startsWith("image/"));
    if (fromFiles.length > 0) return fromFiles;
    return [...data.items].flatMap((item) => {
      if (item.kind !== "file" || !item.type.startsWith("image/")) return [];
      const file = item.getAsFile();
      return file ? [file] : [];
    });
  };

  const removeReference = (id: string) => {
    setReferences((current) => {
      const found = current.find((item) => item.id === id);
      if (found?.url.startsWith("blob:")) URL.revokeObjectURL(found.url);
      return current.filter((item) => item.id !== id);
    });
  };

  const removeDeckFile = (id: string) => {
    setDeckFiles((current) => current.filter((item) => item.id !== id));
  };

  const collectImages = async (): Promise<{ images: Blob[]; marked: boolean }> => {
    const sketchUrl = imageUrl ?? references[0]?.url ?? null;
    const background = sketchUrl ? await blobFromUrl(sketchUrl) : null;
    const hasInk = Boolean(sketchRef.current?.hasInk());
    const marked = hasInk ? await sketchRef.current?.exportMarked(background) : null;
    if (hasInk && !marked) throw new Error("笔迹没能写入参考图");
    const extraRefs = imageUrl ? references : references.slice(1);
    const extras = await Promise.all(extraRefs.map((item) => blobFromUrl(item.url)));
    const images = marked ? [marked, ...extras] : background ? [background, ...extras] : [];
    return { images, marked: Boolean(marked) };
  };

  const imageChoices = studioImageModelById(readStudioImageModel()).ratios;
  const modelIds = chatModelIds(modelSelectionView);
  const intentId = listedModel(modelSelectionView, intentModelId, INTENT_MODEL_KEY);
  const writerId = listedModel(modelSelectionView, pptModelId, PPT_MODEL_KEY);
  const effortAria = intl.formatMessage({ id: "chat.workspace.effort" });
  const effortLabel = (effort: string) => {
    const labelId = thoughtLevelLabelId(effort);
    return labelId ? intl.formatMessage({ id: labelId }) : effort;
  };
  const shownFinal = finalLine(speeches[speeches.length - 1]?.text ?? "");
  const videoSpec = videoCatalogEntry(readStudioVideoModel());
  const activeImageRatio = imageChoices.includes(imageRatio) ? imageRatio : imageChoices[0];
  const activeVideoRatio = videoSpec.ratios.includes(videoRatio) ? videoRatio : videoSpec.ratios[0];
  const activeVideoSeconds = videoSpec.durations.includes(videoSeconds)
    ? videoSeconds
    : videoSpec.durations[0];

  return (
    <section
      className="mb-3 min-w-0 rounded-2xl border border-border bg-card p-3 text-foreground"
      onPaste={(event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        const images = files.length > 0 ? files : imageFiles(event.clipboardData);
        if (images.length === 0 && files.length === 0) return;
        event.preventDefault();
        addReferenceFiles(images);
        void addDeckFiles(files);
      }}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const files = [...event.dataTransfer.files];
        addReferenceFiles(files);
        void addDeckFiles(files);
      }}
    >
      <div className="mb-2 flex flex-wrap gap-2">
        {(["image", "video", "ppt"] as const).map((item) => (
          <Button
            key={item}
            type="button"
            variant={mode === item ? "secondary" : "ghost"}
            className="h-7 px-2 text-ui-caption"
            onClick={() => setMode(item)}
          >
            {intl.formatMessage({ id: `chat.studio.${item}` })}
          </Button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-ui-caption">
        <ModelPick
          label={intl.formatMessage({ id: "chat.studio.intentModel" })}
          value={intentId}
          ids={modelIds}
          efforts={modelEfforts(modelSelectionView, intentId)}
          effort={resolveEffort(
            effortMap[intentId] ?? "",
            modelEfforts(modelSelectionView, intentId),
          )}
          onChange={(next) => {
            setIntentModelId(next);
            persistModel(INTENT_MODEL_KEY, next);
          }}
          onEffort={(next) => setEffortMap(writeEffort(intentId, next))}
          effortAria={effortAria}
          effortLabel={effortLabel}
        />
        <span className="text-muted-foreground">
          {mode === "video" ? videoSpec.name : studioImageModelById(readStudioImageModel()).name}
        </span>
        {mode === "video" ? (
          <>
            <label className="flex items-center gap-1">
              {intl.formatMessage({ id: "chat.studio.ratio" })}
              <select
                value={activeVideoRatio}
                onChange={(event) => setVideoRatio(event.target.value)}
                className="h-7 rounded-lg border border-border bg-background px-2"
              >
                {videoSpec.ratios.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              {intl.formatMessage({ id: "chat.studio.duration" })}
              <select
                value={String(activeVideoSeconds)}
                onChange={(event) => setVideoSeconds(Number(event.target.value))}
                className="h-7 rounded-lg border border-border bg-background px-2"
              >
                {videoSpec.durations.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label className="flex items-center gap-1">
            {intl.formatMessage({ id: "chat.studio.ratio" })}
            <select
              value={activeImageRatio}
              onChange={(event) => setImageRatio(event.target.value)}
              className="h-7 rounded-lg border border-border bg-background px-2"
            >
              {imageChoices.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {mode === "ppt" ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={pptMode === "guided" ? "secondary" : "ghost"}
            className="h-7 px-2 text-ui-caption"
            onClick={() => setPptMode("guided")}
          >
            {intl.formatMessage({ id: "chat.studio.guided" })}
          </Button>
          <Button
            type="button"
            variant={pptMode === "chat" ? "secondary" : "ghost"}
            className="h-7 px-2 text-ui-caption"
            onClick={() => setPptMode("chat")}
          >
            {intl.formatMessage({ id: "chat.studio.direct" })}
          </Button>
          <label className="flex items-center gap-1 text-ui-caption">
            {intl.formatMessage({ id: "chat.studio.pageCount" })}
            <select
              value={pagesChoice}
              onChange={(event) => setPagesChoice(event.target.value)}
              className="h-7 rounded-lg border border-border bg-background px-2"
            >
              {PPT_PAGE_COUNTS.map((count) => (
                <option key={count} value={String(count)}>
                  {count}
                </option>
              ))}
              <option value="custom">
                {intl.formatMessage({ id: "chat.studio.pageCountCustom" })}
              </option>
            </select>
            {pagesChoice === "custom" ? (
              <input
                type="number"
                min={1}
                max={40}
                value={customPages}
                onChange={(event) => setCustomPages(event.target.value)}
                className="h-7 w-16 rounded-lg border border-border bg-background px-2 text-ui-base"
              />
            ) : null}
          </label>
          <ModelPick
            label={intl.formatMessage({ id: "chat.studio.pptModel" })}
            value={writerId}
            ids={modelIds}
            efforts={modelEfforts(modelSelectionView, writerId)}
            effort={resolveEffort(
              effortMap[writerId] ?? "",
              modelEfforts(modelSelectionView, writerId),
            )}
            onChange={(next) => {
              setPptModelId(next);
              persistModel(PPT_MODEL_KEY, next);
            }}
            onEffort={(next) => setEffortMap(writeEffort(writerId, next))}
            effortAria={effortAria}
            effortLabel={effortLabel}
          />
        </div>
      ) : null}
      {mode === "ppt" && pptMode === "guided" ? (
        <div className="mb-2 flex flex-col gap-2">
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={intl.formatMessage({ id: "chat.studio.topic" })}
            className="h-8 rounded-lg border border-border bg-background px-2 text-ui-base"
          />
          <input
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            placeholder={intl.formatMessage({ id: "chat.studio.audience" })}
            className="h-8 rounded-lg border border-border bg-background px-2 text-ui-base"
          />
          <select
            value={deckStyle}
            disabled={busy}
            onChange={(event) => {
              const style = event.target.value;
              setDeckStyle(style);
              setSelectedIds([]);
              setDeckPages((pages) =>
                pages.map((page) => applyDeckTheme(page, deckThemeForStyle(style))),
              );
            }}
            className="h-8 rounded-lg border border-border bg-background px-2 text-ui-caption"
          >
            <option>杂志风</option>
            <option>瑞士风</option>
          </select>
        </div>
      ) : (
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={intl.formatMessage({ id: "chat.studio.prompt" })}
          className="mb-2 min-h-16 w-full rounded-lg border border-border bg-background p-2 text-ui-base"
        />
      )}
      {mode === "ppt" ? (
        <textarea
          value={extraNote}
          onChange={(event) => setExtraNote(event.target.value)}
          placeholder={intl.formatMessage({ id: "chat.studio.extra" })}
          className="mb-2 min-h-14 w-full rounded-lg border border-border bg-background p-2 text-ui-base"
        />
      ) : null}
      {library.length > 0 ? (
        <div className="mb-2">
          <div className="mb-1 flex items-center gap-2">
            <p className="text-ui-caption text-muted-foreground">
              {intl.formatMessage({ id: "chat.studio.library" })}
            </p>
            <label className="flex items-center gap-1 text-ui-caption text-muted-foreground">
              <input
                type="checkbox"
                checked={library.every((item) => pickedPrompts.includes(item.text))}
                onChange={(event) =>
                  setPickedPrompts(event.target.checked ? library.map((item) => item.text) : [])
                }
              />
              {intl.formatMessage({ id: "chat.studio.librarySelectAll" })}
            </label>
            {pickedPrompts.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-7 px-2 text-ui-caption"
                onClick={() => {
                  setLibrary(forgetPrompts(pickedPrompts));
                  setPickedPrompts([]);
                }}
              >
                {intl.formatMessage({ id: "chat.studio.libraryDelete" })}
              </Button>
            ) : null}
          </div>
          <div className="flex max-h-48 w-full min-w-0 flex-col gap-1 overflow-y-auto">
            {library.map((item) => {
              const label = item.text.replace(/\s+/gu, " ").trim();
              return (
                <div key={`${item.kind}-${item.text}`} className="flex min-w-0 items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-2"
                    checked={pickedPrompts.includes(item.text)}
                    aria-label={label}
                    onChange={(event) => {
                      setPickedPrompts((current) =>
                        event.target.checked
                          ? [...current, item.text]
                          : current.filter((text) => text !== item.text),
                      );
                    }}
                  />
                  <button
                    type="button"
                    title={label}
                    className="w-full min-w-0 rounded-lg px-2 py-1.5 text-left font-sans text-ui-base leading-6 text-foreground hover:bg-surface"
                    onClick={() => {
                      setPrompt(item.text);
                      setMode(item.kind);
                      if (item.kind === "ppt") setPptMode("chat");
                    }}
                  >
                    <span className="line-clamp-2 wrap-break-word">{label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {mode !== "ppt" || imageUrl ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-ui-caption">
            <label className="flex items-center gap-1">
              {intl.formatMessage({ id: "chat.studio.color" })}
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-1">
              {intl.formatMessage({ id: "chat.studio.width" })}
              <input
                type="range"
                min={2}
                max={36}
                value={stroke}
                onChange={(event) => setStroke(Number(event.target.value))}
              />
            </label>
            <Button
              type="button"
              variant={erase ? "secondary" : "ghost"}
              className="h-7 px-2"
              onClick={() => setErase((value) => !value)}
            >
              {intl.formatMessage({ id: "chat.studio.eraser" })}
            </Button>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={keepStrokeColor}
                onChange={(event) => setKeepStrokeColor(event.target.checked)}
              />
              {intl.formatMessage({ id: "chat.studio.keepColor" })}
            </label>
            <Button
              type="button"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => sketchRef.current?.clear()}
            >
              {intl.formatMessage({ id: "chat.studio.clear" })}
            </Button>
          </div>
          <SketchPad
            ref={sketchRef}
            backgroundUrl={imageUrl ?? references[0]?.url ?? null}
            color={color}
            width={stroke}
            erase={erase}
          />
          <p className="mt-1 text-ui-caption text-muted-foreground">
            {intl.formatMessage({ id: "chat.studio.panZoom" })}
          </p>
          {imageUrl && mode === "image" ? (
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-3 text-ui-caption"
                disabled={busy || !apiKey}
                onClick={() => void reviseMarked()}
              >
                {intl.formatMessage({ id: "chat.studio.edit" })}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-3 text-ui-caption"
                onClick={copyImage}
              >
                {intl.formatMessage({ id: "chat.studio.copyImage" })}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-3 text-ui-caption"
                onClick={() => void saveImage()}
              >
                {intl.formatMessage({ id: "chat.studio.saveImage" })}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="mt-2">
        <div className="flex flex-wrap gap-2">
          {references.map((item) => (
            <div key={item.id} className="relative size-16">
              <img src={item.url} alt="" className="size-full rounded-lg object-cover" />
              <button
                type="button"
                className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-background/90 text-ui-caption leading-none"
                aria-label={intl.formatMessage({ id: "chat.studio.removeReference" })}
                onClick={() => removeReference(item.id)}
              >
                ×
              </button>
            </div>
          ))}
          {deckFiles.map((file) => (
            <div
              key={file.id}
              className="relative size-16 overflow-hidden rounded-lg border border-border bg-surface p-1"
            >
              <span className="line-clamp-3 break-all text-ui-caption leading-4">{file.name}</span>
              <button
                type="button"
                className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-background/90 text-ui-caption leading-none"
                aria-label={intl.formatMessage({ id: "chat.studio.removeAttachment" })}
                onClick={() => removeDeckFile(file.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <p className="mt-1 text-ui-caption text-muted-foreground">
          {intl.formatMessage({
            id: mode === "ppt" ? "chat.studio.dropAttachment" : "chat.studio.dropReference",
          })}
        </p>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {speeches.map((speech, index) => (
          <div
            key={`${speech.name}-${index}`}
            className="rounded-xl border border-border bg-surface p-2"
          >
            <p className="text-ui-caption text-muted-foreground">{speech.name}</p>
            <MessageResponse streaming={busy}>{speech.text}</MessageResponse>
          </div>
        ))}
      </div>
      {busy ? (
        <GeneratingMark
          label={intl.formatMessage({
            id: shownFinal ? "chat.studio.painting" : "chat.studio.generating",
          })}
        />
      ) : null}
      {shownFinal ? (
        <div className="mt-2 rounded-xl border border-border bg-surface p-2">
          <p className="text-ui-caption text-muted-foreground">
            {intl.formatMessage({ id: "chat.studio.finalPrompt" })}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-ui-base">{shownFinal}</p>
        </div>
      ) : null}
      {outputUrl && mode === "image" ? <ZoomPanImage src={outputUrl} /> : null}
      {videoUrl && mode === "video" ? (
        <video src={videoUrl} controls className="mt-2 max-h-80 w-full rounded-xl" />
      ) : null}
      {deckHtml && retainedLayoutWarning(deckHtml) ? (
        <p role="status" className="text-ui-caption text-amber-600">
          {intl.formatMessage({ id: "chat.studio.layoutKept" })} · {retainedLayoutWarning(deckHtml)}
        </p>
      ) : null}
      {deckProgress ? (
        <p role="status" className="mt-2 text-ui-caption">
          {deckProgress}
        </p>
      ) : null}
      {deckOutput ? (
        <details open={Boolean(error) || undefined} className="mt-2 text-ui-caption">
          <summary>{intl.formatMessage({ id: "chat.studio.aiOutput" })}</summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{deckOutput}</pre>
        </details>
      ) : null}
      {deckHtml ? (
        <SlideDeckView
          disabled={busy && !generatingDeck}
          onGeometryChange={(source, edits) => {
            // 几何操作只提交捕获页的同一版本，避免覆盖 AI 编辑或翻页后的草稿。
            setDeckPages((pages) =>
              pages.map((html, index) =>
                index === deckPage && html === source ? applyDeckGeometry(html, edits) : html,
              ),
            );
          }}
          html={deckHtml}
          page={deckPage}
          total={deckPages.length}
          onPageChange={(page) => {
            setDeckPage(page);
            setSelectedIds([]);
          }}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
        />
      ) : null}
      {deckHtml ? (
        <div
          className="mt-2 rounded-xl border border-dashed border-border p-2"
          onPaste={(event) => {
            const files = [...(event.clipboardData?.files ?? [])];
            const images = files.length > 0 ? files : imageFiles(event.clipboardData);
            if (images.length === 0) return;
            event.preventDefault();
            event.stopPropagation();
            addElementImages(images);
          }}
          onDragOver={(event) => {
            if ([...event.dataTransfer.types].includes("Files")) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            addElementImages(event.dataTransfer.files);
          }}
        >
          <p className="text-ui-caption text-muted-foreground">
            {intl.formatMessage({ id: "chat.studio.elementEdit" })}
          </p>
          {editStatus ? (
            <p role="status" className="mt-2 text-ui-caption">
              {editStatus}
            </p>
          ) : null}
          {editOutput ? (
            <pre
              data-testid="ppt-edit-output"
              className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-ui-caption"
            >
              {editOutput}
            </pre>
          ) : null}
          <textarea
            value={elementNote}
            onChange={(event) => setElementNote(event.target.value)}
            placeholder={intl.formatMessage({ id: "chat.studio.elementPrompt" })}
            className="mt-1 min-h-16 w-full rounded-lg border border-border bg-background p-2 text-ui-base"
          />
          {elementImages.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {elementImages.map((item) => (
                <div key={item.id} className="relative size-16">
                  <img src={item.url} alt="" className="size-full rounded-lg object-cover" />
                  <button
                    type="button"
                    className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-background/90 text-ui-caption leading-none"
                    aria-label={intl.formatMessage({ id: "chat.studio.removeReference" })}
                    onClick={() => removeElementImage(item.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              className="h-8 px-3 text-ui-caption"
              disabled={busy || !apiKey || selectedIds.length === 0}
              onClick={() => void editSelection()}
            >
              {intl.formatMessage({ id: "chat.studio.elementSend" })}
            </Button>
            <span className="text-ui-caption text-muted-foreground">
              {intl.formatMessage({ id: "chat.studio.elementDrop" })}
            </span>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-ui-caption text-warning">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        {busy ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              abortRef.current?.abort();
              setBusy(false);
              setDeckProgress(intl.formatMessage({ id: "chat.studio.stopped" }));
              setEditStatus(intl.formatMessage({ id: "chat.studio.stopped" }));
            }}
          >
            {intl.formatMessage({ id: "chat.studio.stop" })}
          </Button>
        ) : null}
        <Button
          type="button"
          className="h-8 px-3 text-ui-caption"
          disabled={busy || !apiKey}
          onClick={() => void (mode === "ppt" ? runPpt() : runMedia())}
        >
          {intl.formatMessage({
            id: mode === "ppt" ? "chat.studio.makePpt" : "chat.studio.generate",
          })}
        </Button>
        {mode === "ppt" && imageUrl ? (
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-3 text-ui-caption"
            disabled={busy || !apiKey}
            onClick={() => void reviseMarked()}
          >
            {intl.formatMessage({ id: "chat.studio.edit" })}
          </Button>
        ) : null}
        {deckHtml ? (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || !apiKey}
              onClick={() => void repairCurrentLayout()}
            >
              {intl.formatMessage({ id: "chat.studio.repairLayout" })}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-3 text-ui-caption"
              disabled={busy}
              onClick={() => void saveDeck()}
            >
              {intl.formatMessage({ id: "chat.studio.save" })}
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}

function GeneratingMark({ label }: { label: string }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl border border-border p-3">
      <span className="relative grid size-10 place-items-center">
        <span className="absolute size-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
        <span className="size-2 animate-pulse rounded-full bg-foreground" />
      </span>
      <span className="text-ui-caption text-muted-foreground">{label}</span>
    </div>
  );
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const inline = await blobToInline(blob);
  return `data:${inline.mimeType};base64,${inline.base64}`;
}

function imageExtension(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

async function imagePngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法拷贝图片");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((value) => resolve(value), "image/png"),
  );
  if (!png) throw new Error("无法拷贝图片");
  return png;
}

async function blobToInline(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取手绘失败"));
    reader.readAsDataURL(blob);
  });
  const split = dataUrl.indexOf(",");
  return { mimeType: blob.type || "image/png", base64: dataUrl.slice(split + 1) };
}
