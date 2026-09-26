/** 创作面板调用的 ZenMux 生图、改图和生视频。密钥只放在请求头里。 */

import { ZENMUX_APPLICATION_HEADERS } from "@zcode/shared";
import { imageCatalogEntry, readStudioImageModel, readStudioVideoModel, videoCatalogEntry } from "./studioMediaStore.js";

const VERTEX_URL = "https://zenmux.ai/api/vertex-ai/v1";

function vertexModelUrl(model: string): string {
  const slash = model.indexOf("/");
  const provider = slash > 0 ? model.slice(0, slash) : "google";
  const name = slash > 0 ? model.slice(slash + 1) : model;
  return `${VERTEX_URL}/publishers/${provider}/models/${name}`;
}

function imageFromTree(node: unknown, seen = new Set<unknown>()): string | null {
  if (!node || typeof node !== "object" || seen.has(node)) return null;
  seen.add(node);
  const record = node as Record<string, unknown>;
  const inline = record.inlineData ?? record.inline_data;
  if (inline && typeof inline === "object") {
    const data = (inline as { data?: string; mimeType?: string }).data;
    if (typeof data === "string" && data) {
      const mime = (inline as { mimeType?: string }).mimeType || "image/png";
      return `data:${mime};base64,${data}`;
    }
  }
  const b64 = record.bytesBase64Encoded ?? record.b64_json;
  if (typeof b64 === "string" && b64 && !record.videoBytes) {
    return `data:image/png;base64,${b64}`;
  }
  if (typeof record.url === "string" && /^https?:\/\//.test(record.url)) return record.url;
  for (const value of Object.values(record)) {
    const found = imageFromTree(value, seen);
    if (found) return found;
  }
  return null;
}

async function blobBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取参考图失败"));
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function listedChoice(options: readonly string[], value: string | undefined): string {
  return value && options.includes(value) ? value : options[0] ?? "1:1";
}

/** 把接口拒绝的原因带出来。多张参考图若写成扁平字段，会得到 missing image data。 */
function imageError(status: number, payload: string): string {
  let message = "";
  try {
    const parsed = JSON.parse(payload) as { error?: { message?: string } | string; message?: string };
    message = typeof parsed.error === "string" ? parsed.error : parsed.error?.message ?? parsed.message ?? "";
  } catch {
    message = payload;
  }
  const detail = message.replace(/\s+/gu, " ").trim().slice(0, 240);
  return detail ? `生图失败 (${status}) ${detail}` : `生图失败 (${status})`;
}

async function generateVertexImage(
  apiKey: string,
  model: string,
  prompt: string,
  images: readonly Blob[],
  ratio: string | undefined,
): Promise<string> {
  const selected = imageCatalogEntry(model);
  const chosen = listedChoice(selected.ratios, ratio);
  const protocol = selected.protocol;
  const headers = { ...ZENMUX_APPLICATION_HEADERS, Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const encoded = await Promise.all(
    images.map(async (image) => ({
      mimeType: image.type || "image/png",
      data: await blobBase64(image),
    })),
  );
  const references = encoded.map((image, index) => ({
    referenceId: index + 1,
    referenceImage: { bytesBase64Encoded: image.data, mimeType: image.mimeType },
  }));
  const response =
    protocol === "gemini"
      ? await fetch(`${vertexModelUrl(model)}:generateContent`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  ...encoded.map((image) => ({
                    inlineData: { mimeType: image.mimeType, data: image.data },
                  })),
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
              ...(chosen.includes(":") ? { imageConfig: { aspectRatio: chosen } } : {}),
            },
          }),
        })
      : await fetch(`${vertexModelUrl(model)}:predict`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            instances: [
              {
                prompt,
                ...(references.length > 0 ? { referenceImages: references } : {}),
              },
            ],
            parameters:
              selected.ratioKind === "size"
                ? { sampleCount: 1, imageSize: chosen }
                : { sampleCount: 1, aspectRatio: chosen },
          }),
        });
  const payload = await response.text();
  if (!response.ok) throw new Error(imageError(response.status, payload));
  const url = imageFromTree(JSON.parse(payload) as unknown);
  if (!url) throw new Error("生图没有返回图片");
  return url;
}

export async function generateStudioImage(
  apiKey: string,
  prompt: string,
  model = readStudioImageModel(),
  image: Blob | readonly Blob[] | null = null,
  ratio?: string,
): Promise<string> {
  const selected = imageCatalogEntry(model);
  const images = image == null ? [] : Array.isArray(image) ? image : [image];
  if (images.length > 0 && selected.reference === "none") throw new Error("这个生图模型只接受文字，不能带参考图");
  if (images.length === 0 && selected.reference === "required") throw new Error("这个生图模型需要一张参考图");
  return generateVertexImage(apiKey, selected.id, prompt, images, ratio);
}

export function editStudioImage(
  apiKey: string,
  image: Blob,
  prompt: string,
  ratio?: string,
): Promise<string> {
  return generateStudioImage(apiKey, prompt, readStudioImageModel(), image, ratio);
}

function videoModelPath(model: string): string {
  const slash = model.indexOf("/");
  const provider = slash > 0 ? model.slice(0, slash) : "google";
  const name = slash > 0 ? model.slice(slash + 1) : model;
  return `${VERTEX_URL}/publishers/${provider}/models/${name}`;
}

function extractVideoUrl(node: unknown, seen = new Set<unknown>()): string | null {
  if (!node || typeof node !== "object" || seen.has(node)) return null;
  seen.add(node);
  const record = node as Record<string, unknown>;
  const b64 = record.bytesBase64Encoded ?? record.b64_json;
  if (typeof b64 === "string" && b64) {
    const mime = typeof record.mimeType === "string" ? record.mimeType : "video/mp4";
    return `data:${mime};base64,${b64}`;
  }
  for (const key of ["uri", "url", "videoUri"]) {
    const value = record[key];
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  }
  for (const value of Object.values(record)) {
    const found = extractVideoUrl(value, seen);
    if (found) return found;
  }
  return null;
}

export async function generateStudioVideo(
  apiKey: string,
  prompt: string,
  image: { base64: string; mimeType: string } | null,
  signal: AbortSignal,
  options?: { ratio?: string; seconds?: number },
): Promise<string> {
  const model = readStudioVideoModel();
  const spec = videoCatalogEntry(model);
  const ratio = listedChoice(spec.ratios, options?.ratio);
  const seconds = spec.durations.includes(options?.seconds ?? -1)
    ? (options?.seconds as number)
    : spec.durations[0];
  const base = videoModelPath(model);
  const instance: Record<string, unknown> = { prompt };
  if (image) instance.image = { bytesBase64Encoded: image.base64, mimeType: image.mimeType };
  const submit = await fetch(`${base}:predictLongRunning`, {
    method: "POST",
    headers: { ...ZENMUX_APPLICATION_HEADERS, Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [instance],
      parameters: { sampleCount: 1, aspectRatio: ratio, durationSeconds: seconds },
    }),
    signal,
  });
  if (!submit.ok) throw new Error(`视频提交失败 (${submit.status})`);
  const operation = (await submit.json()) as { name?: string };
  if (!operation.name) throw new Error("视频提交没有返回任务号");
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    if (signal.aborted) throw new Error("已取消");
    const poll = await fetch(`${base}:fetchPredictOperation`, {
      method: "POST",
      headers: { ...ZENMUX_APPLICATION_HEADERS, Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ operationName: operation.name }),
      signal,
    });
    if (!poll.ok) continue;
    const status = (await poll.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: unknown;
    };
    if (!status.done) continue;
    if (status.error) throw new Error(status.error.message || "视频生成失败");
    const url = extractVideoUrl(status.response ?? status);
    if (url) return url;
    throw new Error("视频生成没有返回文件");
  }
  throw new Error("视频生成超时");
}

export async function blobFromUrl(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("读取图片失败");
  return response.blob();
}
