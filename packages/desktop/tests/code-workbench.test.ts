import assert from "node:assert/strict";
import { test } from "node:test";
import { workbenchAsset } from "../scripts/code-workbench-assets.mjs";
import { isWithinWorkbench } from "../src/main/code-workbench/process.js";
import { codeWorkbenchSelectionSchema } from "@zcode/shared";

test("IDE selects pinned supported platform builds and rejects missing platforms", () => {
  assert.match(workbenchAsset("darwin", "arm64").name, /macos-arm64/);
  assert.match(workbenchAsset("win32", "x64").name, /windows-amd64/);
  assert.equal(workbenchAsset("linux", "x64").sha256.length, 64);
  assert.throws(() => workbenchAsset("win32", "arm64"));
});
test("AI selection cannot escape workspace via sibling prefix or traversal", () => {
  assert.equal(isWithinWorkbench("/project", "/project/src/a.ts"), true);
  assert.equal(isWithinWorkbench("/project", "/project-other/a.ts"), false);
  assert.equal(isWithinWorkbench("/project", "/project/../secret"), false);
});
test("AI context validates ranges, payload bounds and rejects unknown fields", () => {
  const valid = {
    sourcePath: "/project/a.ts",
    startLine: 1,
    endLine: 2,
    selectedText: "a",
    comment: "explain",
  };
  assert.equal(codeWorkbenchSelectionSchema.safeParse(valid).success, true);
  assert.equal(codeWorkbenchSelectionSchema.safeParse({ ...valid, endLine: 0 }).success, false);
  assert.equal(
    codeWorkbenchSelectionSchema.safeParse({ ...valid, selectedText: "x".repeat(200001) }).success,
    false,
  );
  assert.equal(codeWorkbenchSelectionSchema.safeParse({ ...valid, command: "run" }).success, false);
});

test("missing bundled IDE fails locally without attempting a download", async () => {
  const { resolveBundledWorkbench } = await import("../src/main/code-workbench/install.js");
  const fetchBefore = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("offline");
  };
  try {
    await assert.rejects(resolveBundledWorkbench("/missing-zencode-ide-fixture"), /内置 IDE/);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
