import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTaskContinuation, parseTaskGuidance } from "../../shared/src/task-continuation.js";
import { parseBotCommand } from "../src/bots/commandParser.js";
test("explicit continuation accepts instructions, ordinary new tasks never match", () => {
  for (const text of ["继续", "继续执行", "/continue", "/resume", "从中断处继续！"])
    assert.deepEqual(parseTaskContinuation(text), { guidance: "" });
  assert.deepEqual(parseTaskContinuation("继续执行，先输出 PDF"), { guidance: "先输出 PDF" });
  assert.deepEqual(parseTaskContinuation("/resume use Chinese"), { guidance: "use Chinese" });
  for (const text of [
    "PDF 在哪里？",
    "继续教育课程",
    "继续执行另一个任务",
    "不要继续",
    "resume.pdf",
  ])
    assert.equal(parseTaskContinuation(text), null);
});
test("Weixin slash continuation and guidance retain text for shared admission", () => {
  for (const text of ["/continue", "/resume 先输出 PDF", "/guide 改用中文"])
    assert.deepEqual(parseBotCommand(text), { type: "message", text });
  assert.deepEqual(parseTaskGuidance("/guide 改用中文"), { guidance: "改用中文" });
  assert.deepEqual(parseTaskGuidance("/guide"), { guidance: "" });
  assert.equal(parseTaskGuidance("/guideline"), null);
});
