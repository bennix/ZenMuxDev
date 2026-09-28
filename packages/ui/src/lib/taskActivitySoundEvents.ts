import type { ConversationSnapshot } from "@zcode/shared/zcode-protocol-v4";

export function taskActivitySoundState(snapshot: ConversationSnapshot): Map<string, string> {
  const states = new Map<string, string>();
  for (const item of snapshot.pendingInteractions) {
    if (item.payload.kind !== "workspaceHookReview")
      states.set(`interaction:${item.interactionId}`, "pending");
  }
  for (const work of snapshot.backgroundWorks) states.set(`work:${work.workId}`, work.status);
  for (const row of snapshot.rows.window) {
    if (row.kind !== "turnHeader") continue;
    for (const segment of row.workSegments ?? []) {
      states.set(
        `segment:${row.rowId}:${segment.segmentId}`,
        segment.endedAt === undefined ? "running" : "done",
      );
    }
  }
  return states;
}

export function hasTaskActivitySoundEvent(
  previous: ReadonlyMap<string, string>,
  next: ReadonlyMap<string, string>,
): boolean {
  for (const [key, status] of next) {
    if (key.startsWith("interaction:") && !previous.has(key)) return true;
    if (previous.get(key) === "running" && ["done", "resultPending", "failed"].includes(status))
      return true;
  }
  return false;
}
