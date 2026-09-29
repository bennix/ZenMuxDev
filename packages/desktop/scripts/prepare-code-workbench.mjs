import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, rename, rm, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getTargetPlatform } from "./target-platform.mjs";
import { workbenchAsset, WORKBENCH_VERSION } from "./code-workbench-assets.mjs";

export async function verifyWorkbenchBundle(directory, target) {
  const manifest = JSON.parse(await readFile(join(directory, "zencode-runtime.json"), "utf8"));
  const asset = workbenchAsset(target.os, target.arch);
  if (
    manifest.version !== WORKBENCH_VERSION ||
    manifest.platform !== target.os ||
    manifest.arch !== target.arch ||
    manifest.sha256 !== asset.sha256
  )
    throw new Error("IDE bundle platform/version mismatch");
  await access(join(directory, "out/node/entry.js"));
  await access(join(directory, "lib", target.os === "win32" ? "node.exe" : "node"));
  return directory;
}
export async function prepareWorkbench(
  target = getTargetPlatform(),
  root = resolve(import.meta.dirname, "../bundled-workbench"),
) {
  const asset = workbenchAsset(target.os, target.arch);
  const destination = join(root, target.key);
  try {
    return await verifyWorkbenchBundle(destination, target);
  } catch {
    /* 仅构建阶段准备资产 */
  }
  await mkdir(root, { recursive: true });
  const staging = await mkdtemp(join(root, ".prepare-"));
  try {
    console.log(`[workbench] Preparing ${asset.name} for application bundle`);
    const response = await fetch(
      `https://github.com/coder/code-server/releases/download/v${WORKBENCH_VERSION}/${asset.name}.tar.gz`,
      { signal: AbortSignal.timeout(600_000) },
    );
    if (!response.ok || !response.body)
      throw new Error(`IDE build asset download failed: HTTP ${response.status}`);
    const archive = join(staging, "runtime.tar.gz");
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    if (hash.digest("hex") !== asset.sha256) throw new Error("IDE build asset checksum mismatch");
    await promisify(execFile)("tar", ["-xzf", archive, "-C", staging], { timeout: 120_000 });
    const extracted = join(staging, asset.name);
    await writeFile(
      join(extracted, "zencode-runtime.json"),
      JSON.stringify({
        version: WORKBENCH_VERSION,
        platform: target.os,
        arch: target.arch,
        sha256: asset.sha256,
      }),
    );
    await verifyWorkbenchBundle(extracted, target);
    await rm(destination, { recursive: true, force: true });
    await rename(extracted, destination);
    console.log(`[workbench] Bundled asset ready: ${target.key}`);
    return destination;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await prepareWorkbench();
