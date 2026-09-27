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
      "mimeType" in inline && typeof inline.mimeType === "string" ? inline.mimeType : "image/png";
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
