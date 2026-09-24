import { isZenMuxRequestUrl, omitTemperatureFromJsonText } from "@zcode/shared";

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
    const bodyText = await readJsonTextBody(input, init);
    if (bodyText === undefined) return baseFetch(input, init);
    const nextBody = omitTemperatureFromJsonText(bodyText);
    if (nextBody === undefined) return baseFetch(input, init);
    if (input instanceof Request) {
      return baseFetch(new Request(input, { ...init, body: nextBody }));
    }
    return baseFetch(input, { ...init, body: nextBody });
  };
}
