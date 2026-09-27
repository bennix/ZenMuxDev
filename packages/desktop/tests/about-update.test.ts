import assert from "node:assert/strict";
import { test } from "node:test";
import { aboutUpdatePresentation } from "../src/main/aboutUpdatePresentation.js";
import { createCustomAboutDialogHtml } from "../src/main/aboutWindow.js";
test("about distinguishes installed latest, new version, unsupported build and errors", () => {
  assert.match(
    aboutUpdatePresentation({ kind: "up-to-date", currentVersion: "1.0.0" }, "zh-CN").text,
    /1.0.0/,
  );
  assert.match(
    aboutUpdatePresentation({ kind: "available", version: "2.0.0" }, "en-US").text,
    /2.0.0/,
  );
  assert.match(aboutUpdatePresentation({ kind: "dev-skipped" }, "zh-CN").text, /未启用/);
  assert.equal(
    aboutUpdatePresentation({ kind: "error", message: "offline" }, "en-US").button,
    "Retry",
  );
  assert.match(
    aboutUpdatePresentation({ kind: "ready", version: "2.0.0" }, "zh-CN").button,
    /重启/,
  );
});
test("About contains dedicated update action, version and escaped dynamic content", () => {
  const html = createCustomAboutDialogHtml({
    applicationName: "ZenCode",
    appVersion: "1.2.3",
    copyright: "fixture",
    optimizationLine: "",
    versionLabel: "版本",
    okButtonLabel: "确定",
    checkUpdateLabel: "检查更新",
    checkingLabel: "<untrusted>",
  });
  assert.match(html, /id="check-update"/);
  assert.match(html, /1.2.3/);
  assert.match(html, /&lt;untrusted&gt;/);
  assert.match(html, /zencode-about:\/\/check-update/);
});
test("GitHub source is explicit and rejects URLs or injected paths",async()=>{
 const {parseGitHubUpdateRepository}=await import("../src/main/githubUpdateSource.js");
 assert.equal(parseGitHubUpdateRepository(null),null);
 assert.deepEqual(parseGitHubUpdateRepository("example/desktop"),{owner:"example",repo:"desktop"});
 for(const value of ["https://github.com/example/desktop","example/../secret","example/..",{},"owner/repo?token=secret"]) assert.throws(()=>parseGitHubUpdateRepository(value));
});
