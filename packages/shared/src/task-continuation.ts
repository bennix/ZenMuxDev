/** 显式继续须有词边界；“继续教育”等新任务不能误续跑历史任务。 */
export function parseTaskContinuation(text: string): { guidance: string } | null {
  const match =
    /^(?:\/(?:continue|resume)|继续执行|继续处理|继续完成|从断点继续|从中断处继续|继续|continue|resume)(?:$|[。.!！]+$|[\s，,：:]+([\s\S]*))$/iu.exec(
      text.trim(),
    );
  return match ? { guidance: (match[1] ?? "").trim() } : null;
}
export function parseTaskGuidance(text: string): { guidance: string } | null {
  const match = /^\/guide(?:\s+([\s\S]*)|$)/iu.exec(text.trim());
  return match ? { guidance: (match[1] ?? "").trim() } : null;
}
