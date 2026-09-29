/** 只接受扩展标识和受信任的目录页面，避免把网页路径当成安装命令。 */
export function parseExtensionReference(input: string): string | undefined {
  const value = input.trim();
  const pattern = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i;
  if (pattern.test(value)) return value;
  let id: string | null = null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.port) return undefined;
    if (url.protocol === "vscode:" && !url.hostname) {
      id = url.pathname.match(/^extension\/([^/]+)$/)?.[1] ?? null;
      return id && pattern.test(id) ? id : undefined;
    }
    if (url.protocol !== "https:") return undefined;
    if (url.hostname === "marketplace.visualstudio.com" && url.pathname === "/items") {
      id = url.searchParams.get("itemName");
      return id && pattern.test(id) ? id : undefined;
    }
    if (url.hostname === "open-vsx.org") {
      const match = url.pathname.match(/^\/extension\/([^/]+)\/([^/]+)\/?$/);
      id = match ? `${match[1]}.${match[2]}` : null;
      return id && pattern.test(id) ? id : undefined;
    }
  } catch {
    /* 输入并非 URL，交由调用方显示校验提示。 */
  }
  return undefined;
}
