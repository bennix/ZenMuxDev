import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { EditErrorCode, EditOutputSchema, FileSystemPortError } from "@zcode/contracts";
import { editToolEntry } from "../src/tool/handlers/edit.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

function fixture(content = "const count = 1;\n", exists = true) {
  const writes: string[] = [];
  const context = {
    toolCallId: "edit-test",
    traceId: "test-trace",
    workingDirectory: process.cwd(),
    workspaceRoot: process.cwd(),
    abortSignal: new AbortController().signal,
    fileSystemPort: {
      async stat() {
        if (!exists) throw new FileSystemPortError({ code: "not_found", message: "missing" });
        return { kind: "file", sizeBytes: Buffer.byteLength(content) };
      },
      async readTextFile() {
        return { content, sizeBytes: Buffer.byteLength(content), encoding: "utf8", revision: { id: "v1", mtimeMs: 2 } };
      },
      async writeTextFile(input: { content: string }) {
        writes.push(input.content);
        return { revision: { id: "v2" } };
      },
      async listDirectory() { return { entries: [] }; },
    },
  } as unknown as ToolExecutionContext;
  const run = (old_string: string, new_string = old_string) => editToolEntry.handler({
    file_path: "example.ts", old_string, new_string, replace_all: false,
  }, context);
  return { context, writes, run };
}

test("identical replacements succeed without writing and do not claim an update", async () => {
  const f = fixture();
  const output = EditOutputSchema.parse(await f.run("count = 1"));
  assert.deepEqual(output.structuredPatch, []);
  assert.deepEqual(f.writes, []);
  assert.match(String(editToolEntry.formatModelContent?.(output)), /No changes needed/);
});

test("line-ending normalization can produce a no-op", async () => {
  const f = fixture();
  const output = EditOutputSchema.parse(await f.run("const count = 1;\r\n", "const count = 1;\n"));
  assert.deepEqual(output.structuredPatch, []);
  assert.deepEqual(f.writes, []);
});

test("identical replacements still validate read state and match", async () => {
  const f = fixture();
  assert.equal((await f.run("missing") as { errorCode: number }).errorCode, EditErrorCode.OLD_STRING_NOT_FOUND);
  f.context.readFileState = new Map();
  assert.equal((await f.run("count = 1") as { errorCode: number }).errorCode, EditErrorCode.FILE_NOT_READ);
  f.context.readFileState.set("entry", {
    path: resolve("example.ts"), content: "old", readAt: new Date(), isPartialView: false, mtimeMs: 1, sizeBytes: 3,
  });
  assert.equal((await f.run("count = 1") as { errorCode: number }).errorCode, EditErrorCode.STALE_FILE);
  assert.deepEqual(f.writes, []);
});

test("empty identical strings cannot silently create a missing file", async () => {
  const f = fixture("", false);
  assert.equal((await f.run("") as { errorCode: number }).errorCode, EditErrorCode.FILE_NOT_EXIST);
  assert.deepEqual(f.writes, []);
});

test("real changes still write and return a patch", async () => {
  const f = fixture();
  const output = EditOutputSchema.parse(await f.run("count = 1", "count = 2"));
  assert.deepEqual(f.writes, ["const count = 2;\n"]);
  assert.ok(output.structuredPatch.length > 0);
  assert.match(String(editToolEntry.formatModelContent?.(output)), /updated successfully/);
});
