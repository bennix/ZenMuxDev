import { streamZenMuxChatCompletion, ZenMuxChatError } from "@zcode/shared";

export interface StudioRetry { attempt: number; maxAttempts: number; delayMs: number }

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", aborted); resolve(); }, delayMs);
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

/** 仅重发失败的请求，不重跑页面队列；每次输出由调用方重置，避免残缺 HTML/JSON 被拼接。 */
export async function streamStudioChat(input: Parameters<typeof streamZenMuxChatCompletion>[0] & {
  onAttempt: () => void;
  onRetry?: (retry: StudioRetry) => void;
}): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    input.signal?.throwIfAborted();
    input.onAttempt();
    try {
      await streamZenMuxChatCompletion(input);
      input.signal?.throwIfAborted();
      return;
    } catch (error) {
      if (input.signal?.aborted) throw error;
      if (!(error instanceof ZenMuxChatError) || !error.retryable) throw error;
      if (attempt === maxAttempts) throw new Error(`${error.message} (${attempt}/${maxAttempts})`, { cause: error });
      const delayMs = Math.min(30_000, Math.max(attempt * 1000, error.retryAfterMs ?? 0));
      input.onRetry?.({ attempt: attempt + 1, maxAttempts, delayMs });
      await waitForRetry(delayMs, input.signal);
    }
  }
}
