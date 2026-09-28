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
