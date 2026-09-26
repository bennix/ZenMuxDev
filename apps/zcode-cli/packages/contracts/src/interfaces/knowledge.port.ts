import type { TraceContext } from "../tracing/tracer.js";

export interface KnowledgeSource {
  sessionId: string;
  messageId: string;
  text: string;
  createdAt: number;
}
export interface KnowledgeHit extends KnowledgeSource {
  chunk: string;
  score: number;
  sourcePath: string;
}
/** Workspace-scoped owner. Raw ingestion is durable; embeddings are derived and retryable. */
export interface KnowledgePort {
  capture(source: KnowledgeSource, trace?: TraceContext): Promise<void>;
  search(query: string, options?: { signal?: AbortSignal; trace?: TraceContext }): Promise<KnowledgeHit[]>;
}
