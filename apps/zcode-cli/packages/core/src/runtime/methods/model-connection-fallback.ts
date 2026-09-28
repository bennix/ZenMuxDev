/** 连续连接故障达到三次即交接；鉴权、配额和用户取消不属于连接失败。 */
const CONNECTION_FAILURE_LIMIT = 3;

export function createConnectionFallbackGuard(enabled: boolean) {
  let failures = 0;
  let outputCommitted = false;
  const controller = new AbortController();
  return {
    signal: controller.signal,
    get failures() {
      return failures;
    },
    markOutput() {
      outputCommitted = true;
    },
    failed(reason: string) {
      // 交接引起的取消回调不能清空已确认的三次故障。
      if (controller.signal.aborted) return;
      if (
        !["network_error", "timeout", "stream_idle_timeout", "stale_connection"].includes(reason)
      ) {
        failures = 0;
        return;
      }
      failures++;
      if (enabled && !outputCommitted && failures >= CONNECTION_FAILURE_LIMIT) controller.abort();
    },
  };
}
