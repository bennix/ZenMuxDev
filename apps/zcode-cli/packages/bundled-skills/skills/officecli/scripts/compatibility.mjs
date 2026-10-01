import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRuntime } from "./officecli.mjs";

export function validateSlideImages(images) {
  if (!Array.isArray(images) || !images.length || images.length > 500) throw new Error("invalid_slide_images");
  let size = 0;
  for (const image of images) {
    if (typeof image !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error("invalid_slide_image");
    const bytes = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("invalid_png");
    size += bytes.length;
    if (size > 50 * 1024 * 1024) throw new Error("file_too_large");
  }
}

async function invoke(binary, args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(binary, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OFFICECLI_RESIDENT_FLUSH: "each" } });
    let output = "";
    let errors = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("officecli_timeout")); }, 120_000);
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { errors += chunk; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`OfficeCLI ${args[0]} failed (${code}): ${errors || output}`));
      else resolveResult(output);
    });
  });
}

export async function checkOfficeFile(file, binary) {
  if (![".docx", ".xlsx", ".pptx"].includes(extname(file).toLowerCase())) throw new Error("unsupported_office_format");
  binary ??= await ensureRuntime();
  await invoke(binary, ["save", file]);
  const validation = await invoke(binary, ["validate", file, "--json"]);
  const issues = await invoke(binary, ["view", file, "issues", "--json"]);
  const report = { validation: JSON.parse(validation), issues: JSON.parse(issues) };
  if (report.validation.success !== true || report.issues.success !== true) throw new Error("officecli_check_failed");
  return report;
}

export async function exportVisualPptx(images, destination) {
  validateSlideImages(images);
  const binary = await ensureRuntime();
  const directory = await mkdtemp(join(tmpdir(), "zencode-office-export-"));
  const file = join(directory, "deck.pptx");
  try {
    await invoke(binary, ["create", file, "--locale", "zh-CN"]);
    const commands = [{ command: "set", path: "/", props: { slideWidth: "1280px", slideHeight: "720px", author: "ZenCode" } }];
    for (const [index, image] of images.entries()) {
      const png = join(directory, `${index + 1}.png`);
      await writeFile(png, Buffer.from(image.split(",")[1], "base64"));
      commands.push({ command: "add", parent: "/", type: "slide" });
      commands.push({ command: "add", parent: `/slide[${index + 1}]`, type: "picture", props: { src: png, x: "0", y: "0", width: "1280px", height: "720px", alt: `Slide ${index + 1}` } });
    }
    const batch = join(directory, "commands.json");
    await writeFile(batch, JSON.stringify(commands));
    await invoke(binary, ["batch", file, "--input", batch, "--json"]);
    const report = await checkOfficeFile(file, binary);
    const stats = JSON.parse(await invoke(binary, ["view", file, "stats", "--json"]));
    if (stats.success !== true || stats.data?.slides !== images.length || stats.data?.pictures !== images.length) {
      throw new Error("officecli_export_page_count_mismatch");
    }
    // 先验收临时产物，失败不能覆盖用户原文件。
    await invoke(binary, ["close", file]);
    await copyFile(file, destination);
    return { pages: images.length, ...report };
  } finally {
    await invoke(binary, ["close", file]).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
}

async function main([mode, input, output]) {
  if (mode === "visual-pptx" && input && output) {
    const images = JSON.parse(await readFile(input, "utf8"));
    process.stdout.write(JSON.stringify(await exportVisualPptx(images, output)) + "\n");
  } else if (mode === "check" && input) {
    process.stdout.write(JSON.stringify(await checkOfficeFile(input)) + "\n");
  } else throw new Error("Usage: compatibility.mjs visual-pptx <images.json> <output.pptx> | check <file.docx|xlsx|pptx>");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
}
