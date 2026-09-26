import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import asar from "@electron/asar";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import plist from "plist";
import { refreshMacAsarIntegrity } from "../scripts/macos-asar-integrity.mjs";

test("final archive hash replaces stale metadata and preserves other plist fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-asar-integrity-"));
  try {
    const contents = join(root, "ZenCode.app", "Contents");
    const resources = join(contents, "Resources");
    const source = join(root, "source");
    await mkdir(resources, { recursive: true });
    await mkdir(source);
    await writeFile(join(source, "index.js"), "export const fixed = true;");
    const archive = join(resources, "app.asar");
    await promisify(execFile)(process.execPath, [
      join(require.resolve("@electron/asar/package.json"), "..", "bin", "asar.js"),
      "pack",
      source,
      archive,
    ]);
    const infoPath = join(contents, "Info.plist");
    await writeFile(
      infoPath,
      plist.build({
        CFBundleName: "ZenCode",
        ElectronAsarIntegrity: {
          "Resources/app.asar": { algorithm: "SHA256", hash: "stale" },
          "Resources/other.asar": { algorithm: "SHA256", hash: "preserve" },
        },
      }),
    );
    const context = {
      electronPlatformName: "darwin",
      appOutDir: root,
      packager: { appInfo: { productFilename: "ZenCode" } },
    };
    await refreshMacAsarIntegrity(context);
    const first = await readFile(infoPath, "utf8");
    const parsed = plist.parse(first);
    assert.equal(parsed.CFBundleName, "ZenCode");
    assert.equal(parsed.ElectronAsarIntegrity["Resources/other.asar"].hash, "preserve");
    assert.equal(
      parsed.ElectronAsarIntegrity["Resources/app.asar"].hash,
      createHash("sha256").update(asar.getRawHeader(archive).headerString).digest("hex"),
    );
    await refreshMacAsarIntegrity(context);
    assert.equal(await readFile(infoPath, "utf8"), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-macOS package does not read or change macOS metadata", async () => {
  await refreshMacAsarIntegrity({ electronPlatformName: "linux", appOutDir: "/nonexistent" });
});
