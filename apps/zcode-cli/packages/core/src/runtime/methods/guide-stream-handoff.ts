/** 只中止当前纯文本模型请求；turn 的取消仍由原 owner 负责。 */
export function createGuideStreamHandoff(turnSignal: AbortSignal, hasGuide: () => boolean) {
  const controller = new AbortController();
  let toolStarted = false;
  return {
    signal: AbortSignal.any([turnSignal, controller.signal]),
    get interrupted() { return controller.signal.aborted && !turnSignal.aborted; },
    toolStarted() { toolStarted = true; },
    checkpoint() {
      if (!toolStarted && !turnSignal.aborted && hasGuide()) controller.abort();
    },
  };
}

// 修复静默请求没有快照而永远等不到边界：由已持久化的引导主动唤醒。
const requestWakeups = new WeakMap<object, () => void>();

export function subscribeGuideHandoff(turn: object, checkpoint: () => void): () => void {
  requestWakeups.set(turn, checkpoint);
  checkpoint();
  return () => {
    // 旧请求的清理不能注销同一 turn 的下一次请求。
    if (requestWakeups.get(turn) === checkpoint) requestWakeups.delete(turn);
  };
}

export function notifyGuideHandoff(turn: object): void {
  requestWakeups.get(turn)?.();
}
