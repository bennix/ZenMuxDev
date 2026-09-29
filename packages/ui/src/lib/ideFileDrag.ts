import type { WorkspaceFileDragPayload } from "./workspaceFileDrag.js";

const IDE_FILE_TYPES = [
  "resourceurls",
  "codefiles",
  "application/vnd.code.uri-list",
  "text/uri-list",
];

export function hasIdeFileDrag(data: DataTransfer): boolean {
  return Array.from(data.types).some((type) => IDE_FILE_TYPES.includes(type.toLowerCase()));
}

function localPath(value: string): string | null {
  try {
    let path = value;
    if (/^(file|vscode-remote):/i.test(value)) {
      const uri = new URL(value);
      // 内置 code-server 的资源 URI 使用 vscode-remote，即便磁盘就在本机。
      if (uri.protocol === "vscode-remote:") {
        if (uri.hostname !== "127.0.0.1" && uri.hostname !== "localhost") return null;
      } else if (uri.hostname && uri.hostname !== "localhost") return null;
      path = decodeURIComponent(uri.pathname);
      if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
    }
    path = path.replaceAll("\\", "/");
    if (!path.startsWith("/") && !/^[a-z]:\//i.test(path)) return null;
    if (path.includes("\0") || path.split("/").some((part) => part === ".." || part === "."))
      return null;
    return path.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** VS Code 拖拽不是 OS File：只转换为工作区引用，避免误上传或跨目录引用。 */
export function readIdeFileDrag(
  data: DataTransfer,
  workspacePath: string,
  workspaceIdentity?: string,
): WorkspaceFileDragPayload[] {
  const root = localPath(workspacePath);
  if (!root) return [];
  const paths = new Set<string>();
  for (const type of Array.from(data.types)) {
    if (!IDE_FILE_TYPES.includes(type.toLowerCase())) continue;
    try {
      const raw = data.getData(type);
      if (raw.length > 1_000_000) continue;
      const entries: unknown = ["resourceurls", "codefiles"].includes(type.toLowerCase())
        ? JSON.parse(raw)
        : raw.split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
      if (!Array.isArray(entries)) continue;
      for (const entry of entries.slice(0, 100)) {
        if (typeof entry !== "string") continue;
        const path = localPath(entry);
        if (path && path.startsWith(root + "/")) paths.add(path);
      }
    } catch {
      /* 损坏的拖拽数据不应阻断其他有效格式。 */
    }
  }
  return [...paths].map((path) => ({
    type: "file",
    workspacePath,
    workspaceIdentity,
    path,
    relativePath: path.slice(root.length + 1),
    name: path.split("/").at(-1)!,
  }));
}
