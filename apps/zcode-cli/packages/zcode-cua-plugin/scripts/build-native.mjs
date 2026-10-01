import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rawPlatform = process.env.ZCODE_TARGET_OS || process.platform;
const targetPlatform = ["windows", "win"].includes(rawPlatform)
  ? "win32"
  : ["mac", "macos", "osx"].includes(rawPlatform)
    ? "darwin"
    : rawPlatform;
const rawArch = process.env.ZCODE_TARGET_ARCH || process.arch;
const targetArch = ["x86_64", "amd64"].includes(rawArch)
  ? "x64"
  : rawArch === "aarch64"
    ? "arm64"
    : rawArch;
if (targetPlatform === "win32") {
  await buildWindows(targetArch);
  process.exit(0);
}
if (targetPlatform === "linux") {
  await buildLinux(targetArch);
  process.exit(0);
}
if (targetPlatform !== "darwin") process.exit(0);
const vendor = join(root, "vendor", "maka-cu");
const output = join(root, "bin", `macos-${targetArch}`, "OpenComputerUse");
await mkdir(dirname(output), { recursive: true });
await new Promise((resolveBuild, rejectBuild) => {
  const child = spawn(
    "swift",
    ["build", "-c", "release", "--product", "OpenComputerUse", "--arch", targetArch],
    {
      cwd: vendor,
      stdio: "inherit",
    },
  );
  child.once("error", rejectBuild);
  child.once("exit", (code) =>
    code === 0 ? resolveBuild() : rejectBuild(new Error(`swift build exited ${code}`)),
  );
});
const built = join(vendor, ".build", "apple", "Products", "Release", "OpenComputerUse");
const fallback = join(vendor, ".build", "release", "OpenComputerUse");
const source = await access(built)
  .then(() => built)
  .catch(() => fallback);
await copyFile(source, output);

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Computer Use asset download failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function buildWindows(arch) {
  const name = arch === "x64" ? "amd64" : arch === "arm64" ? "arm64" : undefined;
  if (!name) throw new Error(`Unsupported Windows Computer Use architecture: ${arch}`);
  const tarball = await download("https://registry.npmjs.org/open-computer-use/-/open-computer-use-0.3.6.tgz");
  const integrity = createHash("sha512").update(tarball).digest("base64");
  if (integrity !== "pGNfWBBefl5qzQMo6rkC/e28sOfeczTQ0hEKkYn2sXwti38uz+fC4Y0oBdtnNACemsNVR06Dzp6SozJjkpkbSg==")
    throw new Error("Windows Computer Use package integrity mismatch");
  const temporary = await mkdtemp(join(tmpdir(), "zcode-cua-build-"));
  try {
    const archive = join(temporary, "computer-use.tgz");
    await writeFile(archive, tarball);
    await run("tar", ["-xzf", archive, "-C", temporary,
      `package/dist/windows/${name}/open-computer-use.exe`, "package/LICENSE"]);
    const destination = join(root, "bin", `windows-${arch}`);
    await mkdir(destination, { recursive: true });
    await copyFile(join(temporary, "package", "dist", "windows", name, "open-computer-use.exe"),
      join(destination, "open-computer-use.exe"));
    await copyFile(join(temporary, "package", "LICENSE"), join(root, "LICENSE.open-computer-use"));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function buildLinux(arch) {
  const name = arch === "x64" ? "x86_64" : arch === "arm64" ? "aarch64" : undefined;
  if (!name) throw new Error(`Unsupported Linux Computer Use architecture: ${arch}`);
  const expected = {
    x64: ["d8b578a64308fb0e2290d639078dc31ab2159fb984cc876618d77a7672193e5e", "1cd19eb2b72c5e4977219fc21bec6739a8da3f4bbfb06728623c1129ad214c9f"],
    arm64: ["7c06220a1a3a509447d45074e2d8120c4dd4f33092dda5a39dd7795c836bfdbd", "ed5375af5a80dac12e86866e148df195630358b3d7d615852cce6dec518d08f6"],
  }[arch];
  const destination = join(root, "bin", `linux-${arch}`);
  await mkdir(destination, { recursive: true });
  const base = "https://github.com/agent-sh/computer-use-linux/releases/download/v0.7.8";
  for (const [index, prefix] of ["computer-use-linux", "computer-use-linux-cosmic"].entries()) {
    const filename = `${prefix}-${name}-unknown-linux-gnu`;
    const bytes = await download(`${base}/${filename}`);
    if (createHash("sha256").update(bytes).digest("hex") !== expected[index])
      throw new Error(`Linux Computer Use asset integrity mismatch: ${filename}`);
    const output = join(destination, prefix);
    await writeFile(output, bytes, { mode: 0o755 });
  }
  const license = await download("https://raw.githubusercontent.com/agent-sh/computer-use-linux/v0.7.8/LICENSE");
  await writeFile(join(root, "LICENSE.computer-use-linux"), license);
}

async function run(command, args) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("exit", (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited ${code}`)));
  });
}
