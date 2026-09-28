import assert from "node:assert/strict";
import { test } from "node:test";
import { measuredTextLines, resolvePptxFontFace } from "../src/v4/composer/studio/pptxTextLines.js";

test("PPTX export maps local CSS font families to portable Office fonts", () => {
  assert.equal(resolvePptxFontFace('"PingFang SC", sans-serif', "中文"), "Microsoft YaHei");
  assert.equal(resolvePptxFontFace('"Songti SC", serif', "中文"), "SimSun");
  assert.equal(resolvePptxFontFace('"PingFang SC", sans-serif', "Python"), "Arial");
  assert.equal(resolvePptxFontFace("Georgia, serif", "Python"), "Times New Roman");
  assert.equal(resolvePptxFontFace("Menlo, monospace", "Python"), "Courier New");
});

test("mixed Chinese, Latin and full-width punctuation stay in one block text box", () => {
  const text = "Python 条件判断，if/else。";
  const paragraph: any = {
    nodeType: 1,
    tagName: "P",
    childNodes: [] as any[],
    ownerDocument: {},
    closest: () => null,
  };
  const textNode = { nodeType: 3, textContent: text, parentElement: paragraph };
  paragraph.childNodes.push(textNode);
  const root = { getBoundingClientRect: () => ({ x: 0, y: 0 }) } as HTMLElement;
  const originalGetComputedStyle = globalThis.getComputedStyle;
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value: () => ({
      display: "block",
      fontFamily: '"PingFang SC", sans-serif',
      fontSize: "24px",
      fontWeight: "400",
      fontStyle: "normal",
      color: "rgb(20, 20, 20)",
    }),
  });
  try {
    const frames = measuredTextLines(paragraph, root, {
      kind: "text",
      x: 20,
      y: 30,
      w: 500,
      h: 80,
      text,
      fontSize: 24,
    });
    assert.equal(frames.length, 1);
    assert.equal(frames[0]?.text, text);
    assert.equal(frames[0]?.textRuns?.map((run) => run.text).join(""), text);
    assert.ok(frames[0]?.textRuns?.some((run) => run.fontFace === "Microsoft YaHei"));
    assert.ok(frames[0]?.textRuns?.some((run) => run.fontFace === "Arial"));
  } finally {
    Object.defineProperty(globalThis, "getComputedStyle", {
      configurable: true,
      value: originalGetComputedStyle,
    });
  }
});
