export const ZENMUX_TEMPLATE_ID = "zenmux";
export const ZENMUX_BASE_URL = "https://zenmux.ai/api/v1";
export const ZENMUX_INVITE_URL = "https://zenmux.ai/invite/GBQMC5";
export const ZENMUX_BUILTIN_MODEL_IDS = [
  "openai/gpt-6-astra",
  "openai/gpt-6-sol",
  "anthropic/claude-opus-5.5",
  "x-ai/grok-4.7",
  "typesafe/jev-1.13",
] as const;

/** System One 决策模型。不能走 chat completions。 */
export const ZENMUX_SYSTEM_ONE_MODEL_ID = "typesafe/jev-1.13";

export function isZenMuxSystemOneModel(modelId: string | null | undefined): boolean {
  return modelId?.trim() === ZENMUX_SYSTEM_ONE_MODEL_ID;
}

export type ZenMuxSystemOneQuestionType = "noul" | "choice" | "score";

export interface ZenMuxSystemOneQuestion {
  readonly type: ZenMuxSystemOneQuestionType;
  readonly instructions: string;
  readonly criteria?: Readonly<Record<string, string | null>> | readonly string[];
}

export interface ZenMuxSystemOneRequest {
  readonly model?: string;
  readonly state: string | Record<string, unknown> | readonly unknown[];
  readonly questions: Readonly<Record<string, ZenMuxSystemOneQuestion>>;
}

export function zenMuxSystemOneUrl(baseUrl: string = ZENMUX_BASE_URL): string {
  return `${baseUrl.trim().replace(/\/+$/u, "")}/systemone`;
}

export async function callZenMuxSystemOne(
  apiKey: string,
  request: ZenMuxSystemOneRequest,
  baseUrl: string = ZENMUX_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const key = apiKey.trim();
  if (!key) throw new Error("ZenMux API Key 为空");
  const response = await fetchImpl(zenMuxSystemOneUrl(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model?.trim() || ZENMUX_SYSTEM_ONE_MODEL_ID,
      state: request.state,
      questions: request.questions,
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`ZenMux System One 请求失败 (${response.status})`);
  }
  return body;
}

export type ZenMuxApiKeyValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "empty" | "unauthorized" | "network" | "unexpected" };

const ZENMUX_VALIDATION_TIMEOUT_MS = 15_000;

export function isZenMuxHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "zenmux.ai" || normalized.endsWith(".zenmux.ai");
}

export function isZenMuxBaseUrl(baseUrl: string | null | undefined): boolean {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && isZenMuxHostname(url.hostname);
  } catch {
    return false;
  }
}

export function isZenMuxRequestUrl(requestUrl: string | null | undefined): boolean {
  return isZenMuxBaseUrl(requestUrl);
}

/** 去掉 JSON 请求体里的 temperature。ZenMux 收到该字段会报错。未改动时返回 undefined。 */
export function omitTemperatureFromJsonText(body: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(parsed, "temperature")) return undefined;
  const { temperature: _temperature, ...rest } = parsed as Record<string, unknown>;
  return JSON.stringify(rest);
}

export function zenMuxModelsUrl(baseUrl: string = ZENMUX_BASE_URL): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, "");
  return `${trimmed}/models`;
}

export type ZenMuxChatContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image_url"; readonly image_url: { readonly url: string } };

export interface ZenMuxChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string | readonly ZenMuxChatContentPart[];
}

/** 流式 chat completions。不传 temperature。reasoning 只放调用方按模型能力准备好的字段。 */
export async function streamZenMuxChatCompletion(input: {
  apiKey: string;
  model: string;
  messages: readonly ZenMuxChatMessage[];
  reasoning?: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const key = input.apiKey.trim();
  if (!key) throw new Error("ZenMux API Key 为空");
  const response = await (input.fetchImpl ?? fetch)(`${ZENMUX_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      stream: true,
      ...input.reasoning,
    }),
    signal: input.signal,
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    let message = "";
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string } };
      message = parsed.error?.message?.trim() ?? "";
    } catch {
      message = detail.trim();
    }
    throw new Error(message || `ZenMux 请求失败 (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let parsed: {
        choices?: Array<{ delta?: { content?: string | null; reasoning?: string | null } }>;
      };
      try {
        parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string | null; reasoning?: string | null } }>;
        };
      } catch {
        continue;
      }
      const delta = parsed.choices?.[0]?.delta;
      const text = `${delta?.reasoning ?? ""}${delta?.content ?? ""}`;
      if (text) input.onDelta(text);
    }
  }
}

export interface ZenMuxToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

export const DUCKDUCKGO_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "duckduckgo_search",
    description: "Search DuckDuckGo for current public facts such as prices, news, and dates.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Short search query" },
      },
      required: ["query"],
    },
  },
} as const;

/** 非流式补全，用来让模型先给出检索词。不传 temperature。 */
export async function completeZenMuxChat(input: {
  apiKey: string;
  model: string;
  messages: readonly ZenMuxChatMessage[];
  tools?: readonly unknown[];
  toolChoice?: "auto" | "required";
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ content: string; toolCalls: ZenMuxToolCall[] }> {
  const key = input.apiKey.trim();
  if (!key) throw new Error("ZenMux API Key 为空");
  const response = await (input.fetchImpl ?? fetch)(`${ZENMUX_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      stream: false,
      tools: input.tools,
      tool_choice: input.toolChoice,
    }),
    signal: input.signal,
  });
  const detail = await response.text();
  let parsed: {
    error?: { message?: string };
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };
  try {
    parsed = JSON.parse(detail) as typeof parsed;
  } catch {
    parsed = {};
  }
  if (!response.ok) {
    throw new Error(parsed.error?.message?.trim() || detail.trim() || `ZenMux 请求失败 (${response.status})`);
  }
  const message = parsed.choices?.[0]?.message;
  const toolCalls = (message?.tool_calls ?? []).flatMap((call) => {
    const name = call.function?.name?.trim();
    if (!name) return [];
    return [{ id: call.id?.trim() || name, name, arguments: call.function?.arguments ?? "{}" }];
  });
  return { content: message?.content ?? "", toolCalls };
}

export async function validateZenMuxApiKey(
  apiKey: string,
  baseUrl: string = ZENMUX_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<ZenMuxApiKeyValidation> {
  const key = apiKey.trim();
  if (!key) return { ok: false, reason: "empty" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ZENMUX_VALIDATION_TIMEOUT_MS);
  try {
    const response = await fetchImpl(zenMuxModelsUrl(baseUrl), {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "unauthorized" };
    }
    if (!response.ok) return { ok: false, reason: "unexpected" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}
