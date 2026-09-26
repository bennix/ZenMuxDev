import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKnowledgeAdapter } from "../src/knowledge/index.js";

test("captured input survives restart, deduplicates, and is isolated by workspace identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-knowledge-test-"));
  const http = { request: async () => ({ status: 200, body: Buffer.from(JSON.stringify({ embeddings: [[1, 0]] })) }) };
  try {
    const source = { sessionId: "s", messageId: "m", text: "Project uses Python", createdAt: 1 };
    const create = (workspaceIdentity: string) => createKnowledgeAdapter({ root, workspacePath: "/project", workspaceIdentity, http: http as never });
    const a = create("host-a");
    await a.capture(source);
    await a.capture(source);
    const hits = await create("host-a").search("Python");
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.text, source.text);
    assert.deepEqual(await create("host-b").search("Python"), []);
    assert.equal((await readdir(root)).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("embedding outage preserves raw inputs and retry can rebuild them", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-knowledge-test-"));
  let available = false;
  const adapter = createKnowledgeAdapter({ root, workspacePath: "/project", http: { request: async () => {
    if (!available) throw new Error("model unavailable");
    return { status: 200, body: Buffer.from(JSON.stringify({ embeddings: [[1, 0]] })) };
  }} as never });
  try {
    await adapter.capture({ sessionId: "s", messageId: "m", text: "Keep this input", createdAt: 1 });
    await assert.rejects(adapter.search("input"), /unavailable/);
    available = true;
    assert.equal((await adapter.search("input"))[0]?.text, "Keep this input");
  } finally { await rm(root, { recursive: true, force: true }); }
});
