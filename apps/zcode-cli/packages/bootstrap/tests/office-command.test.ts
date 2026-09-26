import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveZCodeBuiltinPromptCommand } from "../src/builtin-prompt-command.js";
import { isReservedZCodeSlashCommandName } from "../src/slash-command-surface.js";
import { listProtocolSlashCommands } from "../src/zcode-protocol/slash-commands.js";

const names = ["office", "office-create", "office-edit", "office-preview"];

test("Office templates are builtin, reserved and preserve user instructions", () => {
  for (const name of names) {
    assert.equal(isReservedZCodeSlashCommandName(name), true);
    const prompt = resolveZCodeBuiltinPromptCommand(`/${name} report.docx 保留格式`);
    assert.ok(prompt?.includes("officecli"));
    assert.ok(prompt?.includes("report.docx 保留格式"));
  }
  assert.equal(resolveZCodeBuiltinPromptCommand("/office-unknown test"), undefined);
});

test("preview template forbids changing the source and flushes resident edits", () => {
  const prompt = resolveZCodeBuiltinPromptCommand("/office-preview slides.pptx");
  assert.match(prompt!, /read-only/);
  assert.match(prompt!, /save/);
});

test("composer catalog retains Office templates with workflow disabled", async () => {
  const catalog = await listProtocolSlashCommands({ dynamicWorkflowEnabled: false });
  for (const name of names) assert.equal(catalog.find((item) => item.name === name)?.source, "builtin");
});
