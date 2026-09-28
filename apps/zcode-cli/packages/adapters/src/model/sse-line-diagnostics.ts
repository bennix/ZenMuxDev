// 只保留字段名前缀，不保存 data 值；心跳与模型输出必须分别计数。
export function createSseLineDiagnostics(onFirst: (kind: string) => void) {
  const counts = { commentLines: 0, dataLines: 0, eventLines: 0 };
  let prefix = "";
  let line = "";
  let oversized = false;
  const seen = new Set<string>();
  const inspect = () => {
    if (oversized || !line.startsWith("data:")) return;
    try {
      const value = JSON.parse(line.slice(5));
      const known = [
        "message_start",
        "message_delta",
        "message_stop",
        "content_block_start",
        "content_block_delta",
        "content_block_stop",
        "ping",
        "error",
      ];
      const kind = known.includes(value?.type)
        ? value.type
        : Array.isArray(value?.choices)
          ? "openai_choices"
          : value?.error
            ? "error"
            : "other_data";
      if (!seen.has(kind)) {
        seen.add(kind);
        onFirst(kind);
      }
    } catch {
      /* 非 JSON SSE 数据不影响原始流。 */
    }
  };
  let classified = false;
  const count = (kind: keyof typeof counts) => {
    counts[kind]++;
    if (counts[kind] === 1) onFirst(kind);
    classified = true;
  };
  return {
    counts,
    observe(bytes: Uint8Array) {
      for (const byte of bytes) {
        if (byte === 10 || byte === 13) {
          inspect();
          line = "";
          oversized = false;
          prefix = "";
          classified = false;
        } else {
          if (line.length < 4096) line += String.fromCharCode(byte);
          else oversized = true;
          if (!classified && prefix.length < 6) {
            prefix += String.fromCharCode(byte);
            if (prefix === ":") count("commentLines");
            else if (prefix === "data:") count("dataLines");
            else if (prefix === "event:") count("eventLines");
          }
        }
      }
    },
  };
}
