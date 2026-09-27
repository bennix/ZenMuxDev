import { IMAGE_CATALOG, CUSTOM_IMAGE_RATIOS } from "./studio-media-catalog.js";
export const DEFAULT_STUDIO_IMAGE_MODEL = "openai/gpt-image-2";
export interface StudioReferenceImage {
  data: string;
  mimeType: string;
}
export function buildStudioImageRequest(
  model: string,
  prompt: string,
  images: readonly StudioReferenceImage[] = [],
  ratio?: string,
) {
  const selected = IMAGE_CATALOG.find((entry) => entry.id === model) ?? {
    id: model,
    protocol: "vertex",
    reference: "optional",
    ratioKind: "aspect",
    ratios: CUSTOM_IMAGE_RATIOS,
  };
  if (!prompt.trim()) throw new Error("请提供生图要求");
  if (images.length && selected.reference === "none")
    throw new Error("系统默认生图模型不支持参考照片，请在设置中选择支持改图的模型");
  if (!images.length && selected.reference === "required")
    throw new Error("系统默认生图模型需要参考照片");
  const chosen =
    ratio && (selected.ratios as readonly string[]).includes(ratio)
      ? ratio
      : (selected.ratios[0] ?? "1:1");
  const slash = model.indexOf("/");
  const provider = slash > 0 ? model.slice(0, slash) : "google";
  const name = slash > 0 ? model.slice(slash + 1) : model;
  const base = `https://zenmux.ai/api/vertex-ai/v1/publishers/${encodeURIComponent(provider)}/models/${encodeURIComponent(name)}`;
  return selected.protocol === "gemini"
    ? {
        url: base + ":generateContent",
        body: {
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }, ...images.map((image) => ({ inlineData: image }))],
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: chosen },
          },
        },
      }
    : {
        url: base + ":predict",
        body: {
          instances: [
            {
              prompt,
              ...(images.length
                ? {
                    referenceImages: images.map((image, index) => ({
                      referenceId: index + 1,
                      referenceImage: { bytesBase64Encoded: image.data, mimeType: image.mimeType },
                    })),
                  }
                : {}),
            },
          ],
          parameters: {
            sampleCount: 1,
            ...(selected.ratioKind === "size" ? { imageSize: chosen } : { aspectRatio: chosen }),
          },
        },
      };
}
export function extractStudioImage(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  const inline = record.inlineData ?? record.inline_data;
  if (inline && typeof inline === "object" && "data" in inline && typeof inline.data === "string") {
    const mime =
      "mimeType" in inline && typeof inline.mimeType === "string"
        ? inline.mimeType
        : "mime_type" in inline && typeof inline.mime_type === "string"
          ? inline.mime_type
          : "image/png";
    return `data:${mime};base64,${inline.data}`;
  }
  const b64 = record.bytesBase64Encoded ?? record.b64_json;
  if (typeof b64 === "string" && b64 && !record.videoBytes) return `data:image/png;base64,${b64}`;
  if (typeof record.url === "string" && record.url.startsWith("https://")) return record.url;
  for (const value of Object.values(record)) {
    const found = extractStudioImage(value);
    if (found) return found;
  }
  return null;
}

/** 修复：Gemini 的 HTTP 200 也可能只有文字或拦截结果，不能一律报“没有图片”。 */
export function requireStudioImage(
  payload: unknown,
  model: string,
  requestId?: string | null,
): string {
  const image = extractStudioImage(payload);
  if (image) return image;
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const root = record(payload);
  const candidates = Array.isArray(root.candidates) ? root.candidates.map(record) : [];
  const feedback = record(root.promptFeedback ?? root.prompt_feedback);
  const block = feedback.blockReason ?? feedback.block_reason;
  const reasons = candidates.map((candidate) => candidate.finishReason ?? candidate.finish_reason);
  const safeReason = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Z_]{1,64}$/u.test(value);
  const blocked = [
    "SAFETY",
    "IMAGE_SAFETY",
    "PROHIBITED_CONTENT",
    "BLOCKLIST",
    "RECITATION",
    "IMAGE_PROHIBITED_CONTENT",
  ];
  const rejected =
    safeReason(block) && block !== "BLOCK_REASON_UNSPECIFIED"
      ? block
      : reasons.find((reason) => typeof reason === "string" && blocked.includes(reason));
  const textOnly = candidates.some((candidate) => {
    const parts = record(candidate.content).parts;
    return (
      Array.isArray(parts) &&
      parts.some((part) => typeof record(part).text === "string" && record(part).thought !== true)
    );
  });
  let detail = rejected
    ? `服务端拦截了生图（${rejected}）`
    : reasons.includes("MAX_TOKENS")
      ? "输出达到长度限制，未生成图片"
      : textOnly
        ? "模型只返回了文字，没有生成图片"
        : Array.isArray(root.candidates) && !candidates.length
          ? "模型返回空响应，没有生成图片"
          : "响应中未识别到图片";
  const finish = reasons.filter(safeReason).join(", ");
  if (!rejected && finish) detail += `；结束原因：${finish}`;
  const id = [requestId, root.responseId, root.response_id, root.request_id].find(
    (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/u.test(value),
  );
  throw new Error(`${detail}；模型：${model}${id ? `；请求编号：${id}` : ""}`);
}

/** 修复：微信原先丢弃 HTTP 错误正文，400 无法区分参数错误与上游拒绝。 */
export function studioImageHttpError(
  status: number,
  payload: unknown,
  requestId?: string | null,
): string {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const error =
    root.error && typeof root.error === "object" ? (root.error as Record<string, unknown>) : {};
  const message = String(error.message ?? root.message ?? root.error ?? "");
  const code =
    typeof error.code === "string" && /^[a-zA-Z0-9_-]{1,80}$/u.test(error.code) ? error.code : "";
  const text = message + " " + code;
  const reason = /safety|content_policy|moderation|prohibited/iu.test(text)
    ? "模型服务的安全系统拒绝了请求"
    : status === 401 || status === 403
      ? "模型服务鉴权失败或无访问权限"
      : status === 429 || /quota|insufficient.*balance/iu.test(text)
        ? "模型服务额度不足或限流"
        : /image.?size|aspect.?ratio|resolution/iu.test(text)
          ? "模型服务拒绝了图片尺寸或比例参数"
          : /reference|image data|image format|image.*decode/iu.test(text)
            ? "模型服务拒绝了参考图片数据"
            : /invalid.argument|invalid.param/iu.test(text)
              ? "模型服务拒绝了请求参数"
              : "模型服务拒绝了请求";
  const embedded = /request[_ -]?id[:=]\s*([a-zA-Z0-9_-]{1,128})\b/iu.exec(message)?.[1];
  const id = [requestId, root.request_id, error.request_id, embedded].find(
    (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/u.test(value),
  );
  return `生图失败（HTTP ${status}）：${reason}${code ? `；错误码：${code}` : ""}${id ? `；请求编号：${id}` : ""}`;
}
