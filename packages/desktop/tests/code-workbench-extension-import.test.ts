import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExtensionReference } from "../src/main/code-workbench/extensionImport";

test("extension web references resolve without accepting arbitrary URLs", () => {
  for (const value of [
    "pub.ext",
    "https://open-vsx.org/extension/pub/ext",
    "https://marketplace.visualstudio.com/items?itemName=pub.ext",
    "vscode:extension/pub.ext",
  ]) {
    assert.equal(parseExtensionReference(value), "pub.ext");
  }
  for (const value of [
    "https://open-vsx.org.evil/extension/pub/ext",
    "https://evil/items?itemName=pub.ext",
    "javascript:alert(1)",
    "../../bad.vsix",
    "https://user@open-vsx.org/extension/pub/ext",
    "pub.ext/other",
  ]) {
    assert.equal(parseExtensionReference(value), undefined);
  }
});
