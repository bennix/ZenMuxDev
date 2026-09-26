import { DEFAULT_WEIXIN_ILINK_BASE_URL } from "./weixinProvider.js";

import type {
  BotWeixinRegistrationBeginResult,
  BotWeixinRegistrationPollParams,
  BotWeixinRegistrationPollResult,
} from "../bots.js";
import { fetchBotProviderJson } from "./providerRequest.js";
import { WEIXIN_APP_HEADERS, normalizeWeixinBaseUrl, weixinPostHeaders } from "./weixinProtocol.js";

interface WeixinQrBeginResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  data?: unknown;
  qrcode?: string;
  qr_code?: string;
  qrcode_url?: string;
  qrcode_img_content?: string;
  expire_time?: number;
  expires_in?: number;
}

interface WeixinQrPollResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  data?: unknown;
  status?: string | number;
  bot_token?: string;
  token?: string;
  ilink_bot_id?: string;
  bot_id?: string;
  baseurl?: string;
  base_url?: string;
}

const WEIXIN_BOT_API_PREFIX = "/ilink/bot";
const WEIXIN_LOGIN_INTERVAL_SECONDS = 3;
const WEIXIN_LOGIN_EXPIRE_SECONDS = 120;
const WEIXIN_LOGIN_REQUEST_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown> | null | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function readNumber(
  record: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getWeixinRegistrationBaseUrl(): string {
  return DEFAULT_WEIXIN_ILINK_BASE_URL.replace(/\/+$/u, "");
}

function unwrapData(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    return {};
  }
  return isRecord(payload.data) ? { ...payload, ...payload.data } : payload;
}

async function getWeixinRegistrationJson<T>(
  baseUrl: string,
  path: string,
  post = false,
): Promise<T & Record<string, unknown>> {
  const response = await fetchBotProviderJson<unknown>(
    `${normalizeWeixinBaseUrl(baseUrl)}${WEIXIN_BOT_API_PREFIX}${path}`,
    {
      method: post ? "POST" : "GET",
      headers: post ? weixinPostHeaders() : WEIXIN_APP_HEADERS,
      ...(post ? { body: JSON.stringify({ local_token_list: [] }) } : {}),
    },
    WEIXIN_LOGIN_REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`Weixin login request failed: HTTP ${response.status}`);
  const payload = unwrapData(response.payload) as T & Record<string, unknown>;
  const ret = readNumber(payload, "ret");
  const errcode = readNumber(payload, "errcode");
  if ((ret !== null && ret !== 0) || (errcode !== null && errcode !== 0)) {
    throw new Error(
      readString(payload, "errmsg") || `ret=${ret ?? ""} errcode=${errcode ?? ""}`.trim(),
    );
  }
  return payload;
}

function normalizeQrStatus(
  status: unknown,
): "pending" | "scanned" | "need_verifycode" | "redirect" | "success" | "expired" | "error" {
  if (typeof status === "number") {
    if (status === 0) return "pending";
    if (status === 1) return "scanned";
    if (status === 2) return "success";
    if (status === 3 || status === 4) return "expired";
  }
  if (typeof status !== "string") {
    return "pending";
  }
  const normalized = status.toLowerCase();
  if (normalized === "need_verifycode") return "need_verifycode";
  if (normalized === "scaned_but_redirect") return "redirect";
  if (normalized === "verify_code_blocked" || normalized === "binded_redirect") return "error";
  if (["confirmed", "confirm", "authorized", "success", "ok"].includes(normalized)) {
    return "success";
  }
  if (["scaned", "scanned", "scan", "confirmed_wait"].includes(normalized)) {
    return "scanned";
  }
  if (["expired", "timeout", "cancel", "cancelled", "canceled"].includes(normalized)) {
    return "expired";
  }
  if (["error", "failed", "fail"].includes(normalized)) {
    return "error";
  }
  return "pending";
}

export async function beginWeixinRegistration(): Promise<BotWeixinRegistrationBeginResult> {
  const baseUrl = getWeixinRegistrationBaseUrl();
  const payload = await getWeixinRegistrationJson<WeixinQrBeginResponse>(
    baseUrl,
    "/get_bot_qrcode?bot_type=3",
    true,
  );
  const qrCode = readString(payload, "qrcode") || readString(payload, "qr_code");
  const qrUrl = readString(payload, "qrcode_img_content") || readString(payload, "qrcode_url");
  if (!qrCode || !qrUrl) {
    throw new Error("Weixin login did not return a QR code.");
  }
  const expireSeconds = readNumber(payload, "expires_in") ?? WEIXIN_LOGIN_EXPIRE_SECONDS;
  return {
    qrCode,
    qrUrl,
    interval: WEIXIN_LOGIN_INTERVAL_SECONDS,
    expiresAt: Date.now() + expireSeconds * 1000,
  };
}

export async function pollWeixinRegistration(
  params: BotWeixinRegistrationPollParams,
): Promise<BotWeixinRegistrationPollResult> {
  const baseUrl = params.baseUrl
    ? normalizeWeixinBaseUrl(params.baseUrl)
    : getWeixinRegistrationBaseUrl();
  let payload: WeixinQrPollResponse & Record<string, unknown>;
  try {
    payload = await getWeixinRegistrationJson<WeixinQrPollResponse>(
      baseUrl,
      `/get_qrcode_status?qrcode=${encodeURIComponent(params.qrCode)}${params.verifyCode ? `&verify_code=${encodeURIComponent(params.verifyCode)}` : ""}`,
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      // Bugfix: 微信扫码状态接口可能长时间挂起等待手机端确认，超时不代表登录失败。
      // 返回 pending 让 UI 串行继续轮询，避免把正常等待误报成错误。
      return { status: "pending", interval: WEIXIN_LOGIN_INTERVAL_SECONDS };
    }
    throw error;
  }
  const status = normalizeQrStatus(
    payload.status ?? payload["qrcode_status"] ?? payload["qr_status"],
  );
  if (status === "success") {
    const botToken = readString(payload, "bot_token") || readString(payload, "token");
    if (!botToken) {
      return { status: "error", message: "Weixin login succeeded but did not return bot_token." };
    }
    return {
      status: "success",
      botToken,
      baseUrl: normalizeWeixinBaseUrl(
        readString(payload, "baseurl") || readString(payload, "base_url") || baseUrl,
      ),
      userId: readString(payload, "ilink_user_id") || undefined,
      botId: readString(payload, "ilink_bot_id") || readString(payload, "bot_id") || undefined,
    };
  }
  if (status === "redirect") {
    const host = readString(payload, "redirect_host");
    if (!host) return { status: "error", message: "Weixin redirect is missing its host." };
    return {
      status,
      interval: WEIXIN_LOGIN_INTERVAL_SECONDS,
      baseUrl: normalizeWeixinBaseUrl(host.includes("://") ? host : `https://${host}`),
    };
  }
  if (status === "expired") {
    return { status: "expired" };
  }
  if (status === "error") {
    return { status: "error", message: readString(payload, "errmsg") || "Weixin login failed." };
  }
  return { status, interval: WEIXIN_LOGIN_INTERVAL_SECONDS };
}
