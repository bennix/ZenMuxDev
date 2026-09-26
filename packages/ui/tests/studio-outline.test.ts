import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDeckOutline } from "../src/v4/composer/studio/deckOutline.js";
const valid = { core_hook: "test", pages: [{ title: "Title", brief: "Facts with {braces} and a quote: \"text\"", type: "cover", layout: "cover_magazine" }] };
test("accept fenced JSON independently from explanatory braces", () => {
  const result = parseDeckOutline(`Use {title, brief}\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`\nNotes: {done}`, 1);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.outline.pages[0]?.brief, valid.pages[0]?.brief);
});
test("report page count and required-field failures without placeholder content", () => {
  const count = parseDeckOutline(JSON.stringify(valid), 20);
  assert.ok(!count.ok);
  if (!count.ok) assert.match(count.reason, /20.*1/u);
  const fields = parseDeckOutline('{"pages":[{"title":"Only a title"}]}',1);
  assert.ok(!fields.ok);
  if (!fields.ok) assert.match(fields.reason,/第 1 页.*brief/u);
});
test("distinguish empty output from incomplete JSON", () => {
  const empty = parseDeckOutline("",1);
  const partial = parseDeckOutline('{"pages":[',1);
  assert.ok(!empty.ok && !partial.ok);
  if (!empty.ok && !partial.ok) {
    assert.match(empty.reason,/为空/u);
    assert.match(partial.reason,/JSON/u);
  }
});
