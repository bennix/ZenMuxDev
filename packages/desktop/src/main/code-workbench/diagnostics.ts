export function describeWorkbenchExit(
  code: number | null,
  signal: string | null,
  stderr: string,
  privateValues: string[],
): string {
  let detail = stderr.replace(/\u001b\[[0-9;]*m/g, "");
  for (const value of privateValues.filter(Boolean).sort((a, b) => b.length - a.length)) {
    detail = detail.split(value).join("[redacted]");
  }
  detail = detail
    .replace(/(Bearer\s+)[^\s"']+/gi, "$1[redacted]")
    .replace(/((?:token|password|secret|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]")
    .trim()
    .slice(-2000);
  return `IDE process exited during startup (code=${code ?? "none"}, signal=${signal ?? "none"})${detail ? `: ${detail}` : ""}`;
}
