import { isZenMuxRequestUrl, omitTemperatureFromJsonText, ZENMUX_APPLICATION_HEADERS } from "@zcode/shared";

type ProviderFetch = typeof globalThis.fetch;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function readJsonTextBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<string | undefined> {
  if (typeof init?.body === "string") return init.body;
  if (init?.body != null) return undefined;
  if (input instanceof Request) return input.clone().text();
  return undefined;
}

/** ZenMux 拒绝 temperature。只改发往 zenmux.ai 的 JSON 请求体。 */
export function createOmitZenMuxTemperatureFetch(baseFetch: ProviderFetch): ProviderFetch {
  return async (input, init) => {
    if (!isZenMuxRequestUrl(requestUrl(input))) return baseFetch(input, init);
    // SDK 的旧默认标题带平台后缀，在 ZenMux 传输边界统一为应用名称。
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    for (const [name, value] of Object.entries(ZENMUX_APPLICATION_HEADERS)) headers.set(name, value);
    const nextInit: RequestInit = { ...init, headers };
    const bodyText = await readJsonTextBody(input, init);
    if (bodyText === undefined) return baseFetch(input, nextInit);
    const nextBody = omitTemperatureFromJsonText(bodyText);
    if (nextBody === undefined) return baseFetch(input, nextInit);
    if (input instanceof Request) {
      return baseFetch(new Request(input, { ...nextInit, body: nextBody }));
    }
    return baseFetch(input, { ...nextInit, body: nextBody });
  };
}
