import { imageNetworkStage, withImageConnectRetry } from "../imageNetwork.js";
import { Buffer } from "node:buffer";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export async function uploadWeixinImage(
  data: Uint8Array,
  toUserId: string,
  request: (path: string, body: unknown) => Promise<unknown>,
  fetchImpl: typeof fetch = fetch,
) {
  if (!data.length || data.length > MAX_IMAGE_BYTES)
    throw new Error("微信图片大小须在 0–20MB 之间");
  const key = randomBytes(16);
  const filekey = randomBytes(16).toString("hex");
  const cipher = createCipheriv("aes-128-ecb", key, null);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const raw = await imageNetworkStage("微信上传授权", () =>
    request("/getuploadurl", {
      filekey,
      media_type: 1,
      to_user_id: toUserId,
      rawsize: data.length,
      rawfilemd5: createHash("md5").update(data).digest("hex"),
      filesize: encrypted.length,
      no_need_thumb: true,
      aeskey: key.toString("hex"),
    }),
  );
  if (!raw || typeof raw !== "object") throw new Error("微信未返回图片上传地址");
  const result = raw as Record<string, unknown>;
  const url =
    typeof result.upload_full_url === "string" && result.upload_full_url
      ? result.upload_full_url
      : typeof result.upload_param === "string" && result.upload_param
        ? `https://novac2c.cdn.weixin.qq.com/c2c/upload?encrypted_query_param=${encodeURIComponent(result.upload_param)}&filekey=${encodeURIComponent(filekey)}`
        : "";
  if (!url || new URL(url).protocol !== "https:") throw new Error("微信图片上传地址无效");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    return await imageNetworkStage("微信图片上传", async () => {
      const response = await withImageConnectRetry(fetchImpl)(url, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: encrypted,
        signal: controller.signal,
      });
      const param = response.headers.get("x-encrypted-param");
      await response.body?.cancel();
      if (response.status !== 200 || !param)
        throw new Error(`微信图片上传失败 (${response.status})`);
      // iLink 出站 aes_key 是 hex 字符串的 Base64；不能直接把密文或图片 URL 当消息发送。
      return {
        type: 2,
        image_item: {
          media: {
            encrypt_query_param: param,
            aes_key: Buffer.from(key.toString("hex")).toString("base64"),
            encrypt_type: 1,
          },
          mid_size: encrypted.length,
        },
      };
    });
  } finally {
    clearTimeout(timer);
  }
}
