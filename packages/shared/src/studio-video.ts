import {
  CUSTOM_VIDEO_DURATIONS,
  CUSTOM_VIDEO_RATIOS,
  DEFAULT_STUDIO_VIDEO_MODEL,
  RETIRED_STUDIO_VIDEO_MODEL_IDS,
  VIDEO_CATALOG,
  type VideoCatalogEntry,
} from "./studio-media-catalog.js";

export type StudioVideoProtocol = VideoCatalogEntry["protocol"];
export interface StudioVideoImage {
  base64: string;
  mimeType: string;
}
export interface StudioVideoOptions {
  ratio?: string;
  seconds?: number;
  model?: string;
}
export function studioVideoCatalogEntry(id: string): VideoCatalogEntry {
  return (
    VIDEO_CATALOG.find((m) => m.id === id) ?? {
      id,
      name: id,
      protocol: "vertex",
      ratios: CUSTOM_VIDEO_RATIOS,
      durations: CUSTOM_VIDEO_DURATIONS,
    }
  );
}

export function normalizeStudioVideoSelection<
  T extends { videoIds: string[]; defaultVideoId: string },
>(raw: T): T {
  const videoIds = [
    ...new Set(
      raw.videoIds
        .map((id) => id.trim())
        .filter((id) => id && !RETIRED_STUDIO_VIDEO_MODEL_IDS.includes(id)),
    ),
  ];
  if (!videoIds.length) videoIds.push(...VIDEO_CATALOG.map((m) => m.id));
  const defaultVideoId = videoIds.includes(raw.defaultVideoId)
    ? raw.defaultVideoId
    : videoIds.includes(DEFAULT_STUDIO_VIDEO_MODEL)
      ? DEFAULT_STUDIO_VIDEO_MODEL
      : videoIds[0]!;
  return { ...raw, videoIds, defaultVideoId };
}

export function buildStudioVideoRequest(
  model: string,
  prompt: string,
  image: StudioVideoImage | null,
  options: StudioVideoOptions = {},
) {
  if (!prompt.trim()) throw new Error("请提供视频生成要求");
  if (RETIRED_STUDIO_VIDEO_MODEL_IDS.includes(model))
    throw new Error(`该视频模型未通过当前可用性验证：${model}`);
  const spec = studioVideoCatalogEntry(model);
  const ratio = options.ratio ?? spec.ratios[0];
  const seconds = options.seconds ?? spec.durations[0];
  if (!ratio || !spec.ratios.includes(ratio)) throw new Error(`视频模型不支持该比例：${model}`);
  if (seconds === undefined || !spec.durations.includes(seconds))
    throw new Error(`视频模型不支持该时长：${model}`);
  const protocol = spec.protocol;
  let url: string;
  let body: Record<string, unknown>;
  if (protocol === "interactions") {
    const content: Record<string, unknown>[] = [{ type: "text", text: prompt }];
    if (image) content.push({ type: "image", data: image.base64, mime_type: image.mimeType });
    url = "https://zenmux.ai/api/v1/interactions";
    body = {
      model,
      input: [{ type: "user_input", content }],
      response_format: { type: "video", aspect_ratio: ratio, duration: `${seconds}s` },
      stream: false,
    };
  } else if (protocol === "native") {
    const content: Record<string, unknown>[] = [{ type: "text", text: prompt }];
    if (image)
      content.push({
        type: "image_url",
        role: "first_frame",
        image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
      });
    url = "https://zenmux.ai/api/v1/videos";
    body = {
      model,
      content,
      ratio,
      duration: seconds,
      ...(spec.defaultResolution ? { resolution: spec.defaultResolution } : {}),
    };
  } else {
    const [provider, ...name] = model.split("/");
    const base = `https://zenmux.ai/api/vertex-ai/v1/publishers/${encodeURIComponent(provider || "google")}/models/${encodeURIComponent(name.join("/") || model)}`;
    url = base + ":predictLongRunning";
    body = {
      instances: [
        {
          prompt,
          ...(image
            ? { image: { bytesBase64Encoded: image.base64, mimeType: image.mimeType } }
            : {}),
        },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: ratio,
        durationSeconds: seconds,
        ...(spec.defaultResolution ? { resolution: spec.defaultResolution } : {}),
      },
    };
  }
  return { protocol, url, body };
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const safeText = (value: unknown): string =>
  typeof value === "string"
    ? value
        .replace(/https?:\/\/\S+/gu, "[url]")
        .replace(/Bearer\s+\S+/giu, "Bearer [redacted]")
        .slice(0, 500)
    : "";
function videoValue(value: unknown): string | null {
  const v = record(value);
  const mime =
    typeof v.mimeType === "string" && v.mimeType.startsWith("video/")
      ? v.mimeType
      : typeof v.mime_type === "string" && v.mime_type.startsWith("video/")
        ? v.mime_type
        : "video/mp4";
  const data = v.bytesBase64Encoded ?? v.videoBytes ?? v.data;
  if (typeof data === "string" && data) return `data:${mime};base64,${data}`;
  for (const k of ["gcsUri", "uri", "url"]) {
    const url = v[k];
    if (typeof url === "string" && /^https?:\/\//u.test(url)) return url;
  }
  return null;
}
export type StudioVideoResult =
  | { kind: "pending" }
  | { kind: "complete"; url: string }
  | { kind: "failed"; message: string };
export function parseStudioVideoResult(
  protocol: StudioVideoProtocol,
  payload: unknown,
): StudioVideoResult {
  const root = record(payload);
  const error = record(root.error);
  if (
    root.error ||
    root.status === "failed" ||
    root.status === "cancelled" ||
    root.status === "incomplete"
  )
    return { kind: "failed", message: safeText(error.message) || "视频生成失败或未完成" };
  if (protocol === "vertex") {
    if (root.done !== true) return { kind: "pending" };
    const response = record(root.response);
    if (Number(response.raiMediaFilteredCount) > 0)
      return {
        kind: "failed",
        message: Array.isArray(response.raiMediaFilteredReasons)
          ? response.raiMediaFilteredReasons.map(safeText).filter(Boolean).join("；") ||
            "上游拒绝了视频生成请求"
          : "上游拒绝了视频生成请求",
      };
    for (const item of Array.isArray(response.videos) ? response.videos : []) {
      const url = videoValue(item);
      if (url) return { kind: "complete", url };
    }
    for (const item of Array.isArray(response.generated_videos) ? response.generated_videos : []) {
      const url = videoValue(record(item).video);
      if (url) return { kind: "complete", url };
    }
  } else if (protocol === "native") {
    if (root.status === "queued" || root.status === "running") return { kind: "pending" };
    const content = record(root.content);
    if (
      root.status === "succeeded" &&
      typeof content.video_url === "string" &&
      /^https?:\/\//u.test(content.video_url)
    )
      return { kind: "complete", url: content.video_url };
  } else {
    if (root.status === "in_progress") return { kind: "pending" };
    if (root.status === "completed")
      for (const step of Array.isArray(root.steps) ? root.steps : []) {
        const output = record(step);
        if (output.type !== "model_output") continue;
        for (const part of Array.isArray(output.content) ? output.content : []) {
          if (record(part).type !== "video") continue;
          const url = videoValue(part);
          if (url) return { kind: "complete", url };
        }
      }
  }
  return { kind: "failed", message: "视频生成没有返回视频文件" };
}

export function studioVideoHttpError(
  status: number,
  payload: unknown,
  model: string,
  requestId?: string | null,
): string {
  const root = record(payload);
  const error = record(root.error);
  const type = safeText(error.type ?? error.code);
  const message = safeText(error.message ?? root.message);
  const id = requestId ?? root.request_id;
  return `视频请求失败（HTTP ${status}）；模型：${model}${type ? `；错误类型：${type}` : ""}${message ? `；原因：${message}` : ""}${typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/u.test(id) ? `；请求编号：${id}` : ""}`;
}
