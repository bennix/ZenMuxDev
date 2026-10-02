/** 创作面板调用的 ZenMux 生图、改图和生视频。密钥只放在请求头里。 */

import {
  ZENMUX_APPLICATION_HEADERS,
  buildStudioImageRequest,
  requireStudioImage,
  studioImageHttpError,
  buildStudioVideoRequest,
  parseStudioVideoResult,
  studioVideoHttpError,
} from "@zcode/shared";
import { readStudioImageModel, readStudioVideoModel } from "./studioMediaStore.js";

async function blobBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取参考图失败"));
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
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

/** 取消时清理等待，不能让旧运行在切换模型后继续轮询。 */
function waitForVideoPoll(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(signal.reason ?? new DOMException("已取消", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 15000);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export async function generateStudioVideo(
  apiKey: string,
  prompt: string,
  image: { base64: string; mimeType: string } | null,
  signal: AbortSignal,
  options?: { ratio?: string; seconds?: number; model?: string },
): Promise<string> {
  signal.throwIfAborted();
  const model = options?.model ?? readStudioVideoModel();
  // 修复：Omni/原生 videos 不支持 Veo URL；协议和时长统一由当前模型目录决定。
  const request = buildStudioVideoRequest(model, prompt, image, options);
  const headers = {
    ...ZENMUX_APPLICATION_HEADERS,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const submit = await fetch(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify(request.body),
    signal,
  });
  const payload = (await submit.json().catch(() => ({}))) as Record<string, unknown>;
  const requestId = submit.headers.get("x-zenmux-requestid") ?? submit.headers.get("x-request-id");
  signal.throwIfAborted();
  if (!submit.ok) throw new Error(studioVideoHttpError(submit.status, payload, model, requestId));
  const initial = parseStudioVideoResult(request.protocol, payload);
  if (initial.kind === "complete") return initial.url;
  if (initial.kind === "failed") throw new Error(`${initial.message}；模型：${model}`);
  const job = request.protocol === "vertex" ? payload.name : payload.id;
  if (typeof job !== "string" || !job) throw new Error(`视频提交没有返回任务号；模型：${model}`);
  const pollUrl =
    request.protocol === "vertex"
      ? request.url.replace(/:predictLongRunning$/u, ":fetchPredictOperation")
      : `https://zenmux.ai/api/v1/${request.protocol === "native" ? "videos" : "interactions"}/${encodeURIComponent(job)}`;
  let lastPollError = "";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await waitForVideoPoll(signal);
    let poll: Response;
    try {
      poll = await fetch(pollUrl, {
        method: request.protocol === "vertex" ? "POST" : "GET",
        headers,
        ...(request.protocol === "vertex" ? { body: JSON.stringify({ operationName: job }) } : {}),
        signal,
      });
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof TypeError)) throw error;
      // 修复：瞬时网络错误只重查已接受的 job，不重复提交付费生成任务。
      lastPollError = `视频状态查询网络失败；模型：${model}`;
      continue;
    }
    const status = (await poll.json().catch(() => ({}))) as unknown;
    signal.throwIfAborted();
    if (!poll.ok) {
      lastPollError = studioVideoHttpError(poll.status, status, model, requestId);
      if (poll.status === 429 || poll.status >= 500) continue;
      throw new Error(lastPollError);
    }
    lastPollError = "";
    const result = parseStudioVideoResult(request.protocol, status);
    if (result.kind === "pending") continue;
    if (result.kind === "failed")
      throw new Error(
        `${result.message}；模型：${model}${requestId ? `；请求编号：${requestId}` : ""}`,
      );
    return result.url;
  }
  throw new Error(
    lastPollError || `视频生成超时；模型：${model}${requestId ? `；请求编号：${requestId}` : ""}`,
  );
}

export async function blobFromUrl(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("读取图片失败");
  return response.blob();
}
