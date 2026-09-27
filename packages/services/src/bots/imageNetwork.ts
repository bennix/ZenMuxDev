const SAFE_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
]);
const PRECONNECT_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "UND_ERR_CONNECT_TIMEOUT",
]);
export function imageNetworkCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const value = error as { code?: unknown; cause?: unknown; name?: string };
    if (typeof value.code === "string" && SAFE_CODES.has(value.code)) return value.code;
    if (value.name === "TimeoutError" || value.name === "AbortError") return value.name;
    error = value.cause;
  }
  return undefined;
}
export async function imageNetworkStage<T>(stage: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code = imageNetworkCode(error);
    // 修复：不能只回 fetch failed；也不能把底层含签名 URL 的错误原文发送给微信。
    if (code || error instanceof TypeError)
      throw new Error(`${stage}网络失败${code ? `（${code}）` : ""}，请检查网络或代理设置`, {
        cause: error,
      });
    const status =
      error instanceof Error
        ? /(?:HTTP\s+|失败 \()([45]\d{2})\b/u.exec(error.message)?.[1]
        : undefined;
    throw new Error(`${stage}失败${status ? `（HTTP ${status}）` : "，请重试或检查服务配置"}`, {
      cause: error,
    });
  }
}
export function withImageConnectRetry(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchImpl(input, init);
      } catch (error) {
        // 只重试尚未建立连接的失败，避免已提交的付费生图请求被重复执行。
        if (
          attempt >= 2 ||
          init?.signal?.aborted ||
          !PRECONNECT_CODES.has(imageNetworkCode(error) ?? "")
        )
          throw error;
      }
    }
  };
}
