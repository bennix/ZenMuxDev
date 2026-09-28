import { createSseLineDiagnostics } from "./sse-line-diagnostics.js";
import { randomUUID } from "node:crypto";
import type { Logger } from "@zcode/contracts";

// SDK start-step 不代表 HTTP 已返回；在真实 transport 边界记录元信息，避免把等待误判为生成。
export function createModelHttpDiagnosticsFetch(
  fetch: typeof globalThis.fetch,
  logger: Logger | undefined,
  providerId: string,
): typeof globalThis.fetch {
  if (!logger) return fetch;
  return async (input, init) => {
    const startedAt = Date.now();
    const context = { providerId, httpRequestId: randomUUID() };
    const log = (stage: string, details: Record<string, unknown> = {}) => {
      logger.info(`Model HTTP ${stage}`, {
        ...context,
        event: `model.http.${stage}`,
        elapsedMs: Date.now() - startedAt,
        ...details,
      });
    };
    log("started", { method: init?.method ?? (input instanceof Request ? input.method : "GET") });
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      log("failed", { phase: "headers" });
      throw error;
    }
    const serverRequestId =
      response.headers.get("x-zenmux-requestid") ??
      response.headers.get("x-request-id") ??
      response.headers.get("request-id");
    log("response", {
      statusCode: response.status,
      ...(serverRequestId && /^[\w-]{1,128}$/u.test(serverRequestId) ? { serverRequestId } : {}),
    });
    if (!response.body) {
      log("completed", { bytesReceived: 0 });
      return response;
    }
    const sse = response.headers.get("content-type")?.includes("text/event-stream")
      ? createSseLineDiagnostics((kind) => log("sse_first_line", { kind }))
      : undefined;
    const reader = response.body.getReader();
    let bytesReceived = 0;
    let terminal = false;
    const finish = (stage: string) => {
      if (terminal) return;
      terminal = true;
      log(stage, { phase: "body", bytesReceived, ...sse?.counts });
    };
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          try {
            const next = await reader.read();
            if (terminal) return;
            if (next.done) {
              finish("completed");
              reader.releaseLock();
              controller.close();
              return;
            }
            if (next.value.byteLength > 0 && bytesReceived === 0) log("first_bytes");
            bytesReceived += next.value.byteLength;
            sse?.observe(next.value);
            controller.enqueue(next.value);
          } catch (error) {
            if (terminal) return;
            finish("failed");
            reader.releaseLock();
            controller.error(error);
          }
        },
        async cancel(reason) {
          finish("cancelled");
          try {
            await reader.cancel(reason);
          } finally {
            reader.releaseLock();
          }
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
