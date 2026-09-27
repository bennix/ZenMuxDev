import { mkdir, realpath, open } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
export async function prepareWeixinArtifact(workspace: string, kind: "pdf" | "chart") {
  const directory = join(workspace, ".zencode", "weixin-output");
  await mkdir(directory, { recursive: true });
  const path = join(directory, randomUUID() + (kind === "pdf" ? ".pdf" : ".png"));
  return { path, kind, status: "pending" as const };
}
export async function readWeixinArtifact(workspace: string, path: string, kind: "pdf" | "chart") {
  const root = await realpath(workspace);
  const directory = await realpath(join(workspace, ".zencode", "weixin-output"));
  const within = (base: string, target: string) => {
    const rel = relative(base, target);
    return !!rel && !rel.startsWith("..") && !isAbsolute(rel);
  };
  const resolved = await realpath(path);
  if (!within(root, directory) || !within(directory, resolved)) throw new Error("微信产物路径越界");
  const handle = await open(resolved, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size === 0 || stat.size > 20 * 1024 * 1024)
      throw new Error("微信文件须为 0–20MB 的普通文件");
    const data = await handle.readFile();
    // 修复：不能把路径或改后缀的文本文件冒充 PDF/PNG 发给用户。
    if (
      kind === "pdf"
        ? data.subarray(0, 5).toString() !== "%PDF-"
        : !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error("生成文件格式不符，未发送");
    return data;
  } finally {
    await handle.close();
  }
}
export function weixinArtifactInstruction(path: string, kind: "pdf" | "chart") {
  return (
    "\n微信文件交付要求：" +
    (kind === "pdf"
      ? "请使用可用工具生成真正的 PDF，正确显示中文并验证文件可打开。"
      : "请使用绘图/渲染工具制作可视化 PNG，确保数据、坐标和中文文字准确，不用艺术生图代替精确图表。") +
    "保存到以下 JSON 字符串指定的绝对路径：" +
    JSON.stringify(path) +
    "。平台会在本轮任务完成后读取该文件并回送微信。不要只回复代码或链接。缺数据时先询问，不要编造；工具失败则如实报告。"
  );
}
