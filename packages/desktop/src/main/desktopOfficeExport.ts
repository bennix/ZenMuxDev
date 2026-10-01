import { spawn } from "node:child_process";
import { access, copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { app } from "electron";
import { resolveBundledGlmBinaryPath } from "./desktopRuntimeEnv.js";

export function validOfficeSlideImages(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || !value.length || value.length > 500) return false;
  let size = 0;
  for (const image of value) {
    if (typeof image !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image))
      return false;
    size += (image.length * 3) / 4;
    if (size > 50 * 1024 * 1024) return false;
  }
  return true;
}

async function exportScript(): Promise<string> {
  const agent = resolveBundledGlmBinaryPath();
  const suffix = "packages/bundled-skills/skills/officecli/scripts/compatibility.mjs";
  const candidates = [
    ...(agent ? [join(dirname(agent), suffix)] : []),
    ...(!app.isPackaged
      ? [
          resolve(
            app.getAppPath(),
            "../../apps/zcode-cli/packages/bundled-skills/skills/officecli/scripts/compatibility.mjs",
          ),
          resolve(
            process.cwd(),
            "apps/zcode-cli/packages/bundled-skills/skills/officecli/scripts/compatibility.mjs",
          ),
        ]
      : []),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* 只查找当前包或开发目录。 */
    }
  }
  throw new Error("officecli_export_not_bundled");
}

/** Main 只做原生文件导出；不建立第二份任务/页面状态。 */
export async function saveOfficeVisualDeck(
  images: readonly string[],
  destination: string,
): Promise<void> {
  const script = await exportScript();
  const temporary = await mkdtemp(join(tmpdir(), "zencode-office-save-"));
  try {
    const manifest = join(temporary, "images.json");
    await writeFile(manifest, JSON.stringify(images));
    const stagedOutput = join(temporary, "deck.pptx");
    await new Promise<void>((resolveResult, reject) => {
      const child = spawn(process.execPath, [script, "visual-pptx", manifest, stagedOutput], {
        shell: false,
        stdio: ["ignore", "ignore", "pipe"],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      });
      // 包含首次工具下载和逐页构建；超时终止整个导出，不发布未验证文件。
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("officecli_export_timeout"));
      }, 10 * 60_000);
      let error = "";
      child.stderr.on("data", (chunk) => {
        error = (error + String(chunk)).slice(-4000);
      });
      child.once("error", (failure) => {
        clearTimeout(timer);
        reject(failure);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolveResult();
        else reject(new Error(`officecli_export_failed (${code}): ${error}`));
      });
    });
    await copyFile(stagedOutput, destination);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
