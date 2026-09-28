import { useEffect, useRef } from "react";
import type { ConversationSnapshot } from "@zcode/shared/zcode-protocol-v4";
import {
  taskActivitySoundState,
  hasTaskActivitySoundEvent,
} from "@/lib/taskActivitySoundEvents.js";
import { playTaskNotificationSound } from "@/lib/taskNotificationSound.js";

export function useTaskActivitySound(
  snapshot: ConversationSnapshot | null,
  workspaceKey: string,
): void {
  const previous = useRef<{ key: string; states: Map<string, string> } | null>(null);
  useEffect(() => {
    if (!snapshot) {
      previous.current = null;
      return;
    }
    const key = `${workspaceKey}\0${snapshot.sessionId}\0${snapshot.logEpoch}`;
    const states = taskActivitySoundState(snapshot);
    const before = previous.current;
    previous.current = { key, states };
    // 首帧/重连只建立基线；后台通知由平台处理，避免同一事件前后台重复响铃。
    if (
      before?.key === key &&
      document.hasFocus() &&
      document.visibilityState === "visible" &&
      hasTaskActivitySoundEvent(before.states, states)
    )
      void playTaskNotificationSound();
  }, [snapshot, workspaceKey]);
}
