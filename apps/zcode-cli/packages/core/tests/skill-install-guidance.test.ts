import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionGuidanceSection } from "../src/context/dynamic-sections.js";

test("first-skill installation gets discoverable path guidance before any skills exist", () => {
  const section = buildSessionGuidanceSection(["Read", "Write", "Bash"], false);
  assert.ok(section);
  const content = JSON.stringify(section);
  assert.match(content, /~\/\.zcode\/skills/);
  assert.match(content, /<workspace>\/\.zcode\/skills/);
  assert.match(content, /Merely invoking Skill does not install it/);
});

test("a read-only session is not instructed to install skills", () => {
  assert.equal(buildSessionGuidanceSection(["Read"], false), null);
});
