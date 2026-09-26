import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSkillsService } from "../src/skills/skillsService.js";

test("a conversation-created first skill appears on the next settings scan without registration", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "conversation-skill-"));
  try {
    const service = createSkillsService({ isDesktopRuntime: false });
    const name = "conversation-installed-test";
    assert.equal(
      (await service.list({ workspacePath })).skills.some((skill) => skill.name === name),
      false,
    );
    const directory = join(workspacePath, ".zcode", "skills", name);
    await mkdir(join(directory, "scripts"), { recursive: true });
    await writeFile(
      join(directory, "SKILL.md"),
      `---\nname: ${name}\ndescription: Created through an AI conversation\n---\nUse scripts/helper.js.\n`,
    );
    await writeFile(join(directory, "scripts", "helper.js"), "export const value = 1;\n");
    const result = await service.list({ workspacePath });
    const skill = result.skills.find((item) => item.name === name);
    assert.equal(skill?.scope, "workspace");
    assert.equal(skill?.enabled, true);
    assert.equal(skill?.path, await realpath(join(directory, "SKILL.md")));
    assert.match(skill?.body ?? "", /scripts\/helper.js/);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
