/** 创作面板调用的 ZenMux 生图、改图和生视频。密钥只放在请求头里。 */

import {
  ZENMUX_APPLICATION_HEADERS,
  buildStudioImageRequest,
  requireStudioImage,
  studioImageHttpError,
} from "@zcode/shared";
import {
  readStudioImageModel,
  readStudioVideoModel,
  videoCatalogEntry,
} from "./studioMediaStore.js";

const VERTEX_URL = "https://zenmux.ai/api/vertex-ai/v1";

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
  return value && options.includes(value) ? value : (options[0] ?? "1:1");
}

/** 把接口拒绝的原因带出来。多张参考图若写成扁平字段，会得到 missing image data。 */
function imageError(status: number, payload: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    parsed = {};
  }
  return studioImageHttpError(status, parsed);
}

async function generateVertexImage(
  apiKey: string,
  model: string,
  prompt: string,
  images: readonly Blob[],
  ratio: string | undefined,
): Promise<string> {
  const encoded = await Promise.all(
    images.map(async (image) => ({
      mimeType: image.type || "image/png",
      data: await blobBase64(image),
    })),
  );
  const request = buildStudioImageRequest(model, prompt, encoded, ratio);
  const response = await fetch(request.url, {
    method: "POST",
    headers: {
      ...ZENMUX_APPLICATION_HEADERS,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request.body),
  });
  const payload = await response.text();
  if (!response.ok) throw new Error(imageError(response.status, payload));
  const url = requireStudioImage(
    JSON.parse(payload) as unknown,
    model,
    response.headers.get("x-request-id"),
  );
  return url;
}

export async function generateStudioImage(
  apiKey: string,
  prompt: string,
  model = readStudioImageModel(),
  image: Blob | readonly Blob[] | null = null,
  ratio?: string,
): Promise<string> {
  const images = image == null ? [] : Array.isArray(image) ? image : [image];
  return generateVertexImage(apiKey, model, prompt, images, ratio);
}

export function editStudioImage(
  apiKey: string,
  image: Blob,
  prompt: string,
  ratio?: string,
  model = readStudioImageModel(),
): Promise<string> {
  return generateStudioImage(apiKey, prompt, model, image, ratio);
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
  options?: { ratio?: string; seconds?: number; model?: string },
): Promise<string> {
  const model = options?.model ?? readStudioVideoModel();
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
    headers: {
      ...ZENMUX_APPLICATION_HEADERS,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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
      headers: {
        ...ZENMUX_APPLICATION_HEADERS,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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
