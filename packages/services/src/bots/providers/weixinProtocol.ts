import { Buffer } from "node:buffer";
import { randomInt } from "node:crypto";

export const WEIXIN_APP_HEADERS = {
  "iLink-App-Id": "bot",
  "iLink-App-ClientVersion": "132102",
};
export const WEIXIN_BASE_INFO = { channel_version: "2.4.8", bot_agent: "ZenCode" };
export class WeixinSessionExpiredError extends Error {
  readonly code = "WEIXIN_SESSION_EXPIRED";
  constructor() {
    super("Weixin session expired. Pair again in Settings.");
  }
}
export function weixinPostHeaders(token?: string): Record<string, string> {
  return {
    ...WEIXIN_APP_HEADERS,
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "X-WECHAT-UIN": Buffer.from(String(randomInt(0, 0x1_0000_0000)), "utf8").toString("base64"),
  };
}
export function normalizeWeixinBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("Invalid Weixin API base URL");
  }
  return url.origin;
}
export function splitWeixinText(text: string): string[] {
  const characters = Array.from(text);
  const chunks: string[] = [];
  for (let index = 0; index < characters.length; index += 4000)
    chunks.push(characters.slice(index, index + 4000).join(""));
  return chunks;
}
