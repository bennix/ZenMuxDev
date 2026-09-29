import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

/** IDE 是安装包必需资产；缺失应报告构建问题，不在用户点击时偷偷下载。 */
export async function resolveBundledWorkbench(directory: string): Promise<string> {
  try {
    const manifest = JSON.parse(await readFile(join(directory, "zencode-runtime.json"), "utf8"));
    if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
      throw new Error("IDE platform mismatch");
    }
    await access(join(directory, "out/node/entry.js"));
    await access(join(directory, "lib", process.platform === "win32" ? "node.exe" : "node"));
    return directory;
  } catch {
    throw new Error(
      "内置 IDE 运行时缺失或平台不匹配，请重新构建或安装完整的 ZenCode。开发环境请运行 pnpm --dir packages/desktop prepare:code-workbench。",
    );
  }
}
