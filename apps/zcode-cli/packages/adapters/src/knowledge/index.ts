import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { HttpClientPort, KnowledgeHit, KnowledgePort, KnowledgeSource, TraceContext } from "@zcode/contracts";

const CHUNK_SIZE = 1000;
const CHUNK_STRIDE = 800;
const MAX_HITS = 6;
const configSchema = z.object({
  endpoint: z.string().url().default("http://127.0.0.1:11434/api/embed"),
  model: z.string().min(1).default("bge-m3"),
}).strict();
const sourceSchema = z.object({ sessionId: z.string(), messageId: z.string(), text: z.string(), createdAt: z.number() });
const vectorSchema = z.array(z.number().finite()).min(1);
const indexSchema = z.object({ fingerprint: z.string(), chunks: z.array(z.object({ text: z.string(), vector: vectorSchema })) });
const embeddingsSchema = z.object({ embeddings: z.array(vectorSchema) });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function createKnowledgeAdapter(options: {
  root: string;
  workspacePath: string;
  workspaceIdentity?: string;
  http: HttpClientPort;
}): KnowledgePort {
  const workspaceKey = options.workspaceIdentity?.trim() || options.workspacePath;
  const root = join(options.root, hash(workspaceKey));
  const rawRoot = join(root, "raw");
  const vectorRoot = join(root, "vectors");
  // 原文按消息身份唯一落盘；向量独立原子发布，失败不能污染已保存的用户输入。
  return {
    async capture(source) {
      await mkdir(rawRoot, { recursive: true });
      const id = hash(`${source.sessionId}\0${source.messageId}`);
      const path = join(rawRoot, `${id}.json`);
      try {
        await writeFile(path, JSON.stringify(sourceSchema.parse(source)), { flag: "wx", mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    },
    async search(query, request = {}) {
      await mkdir(rawRoot, { recursive: true });
      const files = (await readdir(rawRoot)).filter((name) => name.endsWith(".json"));
      if (files.length === 0 || !query.trim()) return [];
      const config = await loadConfig(root);
      const fingerprint = hash(JSON.stringify(config));
      const embed = (text: string) => embedText(options.http, config, text, request.signal, request.trace);
      const queryVector = await embed(query);
      const hits: KnowledgeHit[] = [];
      await mkdir(vectorRoot, { recursive: true });
      for (const file of files) {
        request.signal?.throwIfAborted();
        const sourcePath = join(rawRoot, file);
        const source = sourceSchema.parse(JSON.parse(await readFile(sourcePath, "utf8")));
        const indexPath = join(vectorRoot, file);
        let index = await readIndex(indexPath);
        if (!index || index.fingerprint !== fingerprint || index.chunks.some((chunk) => chunk.vector.length !== queryVector.length)) {
          const chunks: Array<{ text: string; vector: number[] }> = [];
          for (let start = 0; start < source.text.length; start += CHUNK_STRIDE) {
            const text = source.text.slice(start, start + CHUNK_SIZE);
            const vector = await embed(text);
            if (vector.length !== queryVector.length) throw new Error("Embedding dimensions changed during indexing");
            chunks.push({ text, vector });
          }
          index = { fingerprint, chunks };
          await atomicWrite(indexPath, JSON.stringify(index));
        }
        for (const chunk of index.chunks) {
          const score = cosine(queryVector, chunk.vector);
          if (score > 0) hits.push({ ...source, chunk: chunk.text, score, sourcePath });
        }
      }
      return hits.sort((a, b) => b.score - a.score).slice(0, MAX_HITS);
    },
  };
}

async function loadConfig(root: string) {
  try { return configSchema.parse(JSON.parse(await readFile(join(root, "config.json"), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return configSchema.parse({}); throw error; }
}
async function readIndex(path: string) {
  try { return indexSchema.parse(JSON.parse(await readFile(path, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError || error instanceof z.ZodError) return null; throw error; }
}
async function atomicWrite(path: string, content: string) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, content, { flag: "wx", mode: 0o600 }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}
async function embedText(http: HttpClientPort, config: z.infer<typeof configSchema>, text: string, signal?: AbortSignal, trace?: TraceContext) {
  const response = await http.request({ url: config.endpoint, method: "POST", headers: { "Content-Type": "application/json" }, body: Buffer.from(JSON.stringify({ model: config.model, input: text })), timeoutMs: 30_000, maxResponseBytes: 2 * 1024 * 1024, trace }, { signal });
  if (response.status !== 200) throw new Error(`Knowledge embedding failed (HTTP ${response.status}); check local embedding model configuration`);
  const vectors = embeddingsSchema.parse(JSON.parse(Buffer.from(response.body).toString("utf8"))).embeddings;
  if (vectors.length !== 1 || !vectors[0]) throw new Error("Embedding service returned an invalid vector count");
  return vectors[0];
}
function cosine(left: number[], right: number[]) {
  if (left.length !== right.length) return 0;
  let dot = 0; let a = 0; let b = 0;
  for (let i = 0; i < left.length; i++) { const x = left[i]!; const y = right[i]!; dot += x * y; a += x * x; b += y * y; }
  return a && b ? dot / Math.sqrt(a * b) : 0;
}
