import assert from "node:assert/strict";
import { test } from "node:test";
import { selectAsset, verifyAssetBytes } from "../../bundled-skills/skills/officecli/scripts/officecli.mjs";

test("runtime selection covers supported operating systems and libc", () => {
  assert.equal(selectAsset("darwin", "arm64"), "officecli-mac-arm64");
  assert.equal(selectAsset("win32", "x64"), "officecli-win-x64.exe");
  assert.equal(selectAsset("linux", "arm64", true), "officecli-linux-alpine-arm64");
  assert.throws(() => selectAsset("freebsd", "x64"), /Unsupported/);
  assert.throws(() => selectAsset("linux", "ia32"), /Unsupported/);
});
test("untrusted or corrupted binaries are rejected", () => {
  assert.throws(() => verifyAssetBytes("officecli-mac-arm64", Buffer.from("corrupt")), /checksum/);
  assert.throws(() => verifyAssetBytes("unknown", Buffer.from("corrupt")), /Unknown/);
});
