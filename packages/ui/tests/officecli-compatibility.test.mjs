import assert from "node:assert/strict";
import { build } from "esbuild";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ensureRuntime } from "../../../apps/zcode-cli/packages/bundled-skills/skills/officecli/scripts/officecli.mjs";
import {
  checkOfficeFile,
  exportVisualPptx,
  validateSlideImages,
} from "../../../apps/zcode-cli/packages/bundled-skills/skills/officecli/scripts/compatibility.mjs";
const run = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "zencode-office-test-"));
try {
  const binary = await ensureRuntime();
  for (const format of ["docx", "xlsx"]) {
    const file = join(temporary, `sample.${format}`);
    await run(binary, ["create", file, "--locale", "zh-CN"]);
    const report = await checkOfficeFile(file, binary);
    assert.equal(report.validation.success, true);
    assert.equal(report.issues.success, true);
    await run(binary, ["view", file, "html", "--out", join(temporary, `${format}.html`)]);
    assert.ok((await readFile(join(temporary, `${format}.html`), "utf8")).includes("<html"));
    await run(binary, ["close", file]);
  }
  const adapter = join(temporary, "desktop-export.mjs");
  await build({
    entryPoints: ["packages/desktop/src/main/desktopOfficeExport.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: adapter,
    plugins: [
      {
        name: "native-platform-fixture",
        setup(builder) {
          builder.onResolve({ filter: /^electron$|desktopRuntimeEnv\.js$/ }, (args) => ({
            path: args.path,
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            contents:
              args.path === "electron"
                ? `export const app = { isPackaged: false, getAppPath: () => ${JSON.stringify(join(process.cwd(), "packages/desktop"))} };`
                : "export const resolveBundledGlmBinaryPath = () => undefined;",
          }));
        },
      },
    ],
  });
  const native = await import(pathToFileURL(adapter));
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  assert.equal(native.validOfficeSlideImages([png]), true);
  assert.equal(native.validOfficeSlideImages([]), false);
  const nativeOutput = join(temporary, "native.pptx");
  await native.saveOfficeVisualDeck([png], nativeOutput);
  assert.equal((await checkOfficeFile(nativeOutput, binary)).validation.success, true);
  await run(binary, ["close", nativeOutput]);
  assert.throws(() => validateSlideImages([]));
  assert.throws(() => validateSlideImages(["data:image/png;base64,YWJj"]));
  const existing = join(temporary, "existing.pptx");
  await writeFile(existing, "original");
  await assert.rejects(exportVisualPptx([], existing));
  assert.equal(await readFile(existing, "utf8"), "original");
  const skill = join(temporary, "skill");
  await cp("apps/zcode-cli/packages/bundled-skills/skills/officecli/scripts", skill, {
    recursive: true,
  });
  const runtime = join(skill, "runtime", basename(dirname(binary)));
  await mkdir(runtime, { recursive: true });
  await cp(binary, join(runtime, basename(binary)));
  const offline = await import(pathToFileURL(join(skill, "officecli.mjs")));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Network disabled");
  };
  try {
    assert.equal(
      await realpath(await offline.ensureRuntime()),
      await realpath(join(runtime, basename(binary))),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(
    "PASS: DOCX/XLSX save, schema/issues/HTML checks; invalid input preserves destination; bundled binary runs offline",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
