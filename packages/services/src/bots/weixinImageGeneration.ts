import { Buffer } from "node:buffer";
import {
  buildStudioImageRequest,
  extractStudioImage,
  ZENMUX_APPLICATION_HEADERS,
  type StudioReferenceImage,
  type BotContextState,
} from "@zcode/shared";
import { fetchBotProviderJson } from "./providers/providerRequest.js";

const REFERENCE_PHOTO_TTL_MS = 30 * 60 * 1000;
export function recentWeixinPhotos(
  context: Pick<BotContextState, "recentWeixinPhotos">,
  userId: string,
  now = Date.now(),
) {
  const photos = context.recentWeixinPhotos;
  if (
    !photos ||
    photos.userId !== userId ||
    now < photos.savedAt ||
    now - photos.savedAt >= REFERENCE_PHOTO_TTL_MS
  )
    return [];
  return photos.images;
}

export function resolveWeixinImageRequest(
  text: string,
  hasPhoto: boolean,
): { kind: "help" | "generate"; prompt: string } | null {
  const value = text.trim();
  // 修复：礼貌问句包含具体对象时也是生图请求；只有泛问能力才返回帮助。
  const request = value.replace(/^(?:你)?(?:能不能|能否|能够|可以|支持|会|能)\s*(?:帮我\s*)?/u, "");
  const instruction = request.replace(/[吗么]?[？?。！!]*$/u, "").trim();
  if (
    /^(?:生图|改图|(?:生成|制作|画)\s*(?:一张|一幅)?\s*(?:图像|图片|照片|图|画))$/u.test(
      instruction,
    )
  ) {
    return { kind: "help", prompt: "" };
  }
  if (/^\/image(?:\s|$)/iu.test(value))
    return {
      kind: value.replace(/^\/image\s*/iu, "") ? "generate" : "help",
      prompt: value.replace(/^\/image\s*/iu, ""),
    };
  const direct =
    /^(?:请|帮我|请帮我|给我|麻烦)?\s*(?:生成|画|绘制|制作)(?:一张|一个|一幅|张|幅)?[^\n]{0,35}(?:图|画|照片|海报|头像|壁纸)/u.test(
      instruction,
    );
  const edit =
    hasPhoto &&
    /^(?:请|帮我|请帮我)?\s*(?:把|将|修改|编辑|美化|重绘|换背景|去背景|改成|变成)/u.test(
      instruction,
    );
  return direct || edit ? { kind: "generate", prompt: value } : null;
}

export async function generateWeixinImage(input: {
  apiKey: string;
  model: string;
  prompt: string;
  images: StudioReferenceImage[];
}) {
  const request = buildStudioImageRequest(input.model, input.prompt, input.images);
  const response = await fetchBotProviderJson<unknown>(
    request.url,
    {
      method: "POST",
      headers: {
        ...ZENMUX_APPLICATION_HEADERS,
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request.body),
    },
    180_000,
  );
  if (!response.ok) throw new Error(`默认生图模型请求失败 (${response.status})`);
  const result = extractStudioImage(response.payload);
  if (!result) throw new Error("默认生图模型没有返回图片");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/u.exec(result);
  if (match) {
    const bytes = Buffer.from(match[2]!, "base64");
    if (!bytes.length || bytes.length > 20 * 1024 * 1024)
      throw new Error("生成图片为空或超过 20MB");
    return { data: bytes, mimeType: match[1]! };
  }
  // 模型的图片 URL 只在后台读取，不能作为文本链接冒充微信图片回传。
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(result, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error("无法下载生成图片");
    const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType))
      throw new Error("生图返回了不支持的图片格式");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 20 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("生成图片超过 20MB");
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    if (!size) throw new Error("生成图片为空");
    return { data: Buffer.concat(chunks), mimeType };
  } finally {
    clearTimeout(timeout);
  }
}
