import type { Locale, UpdateCheckResultPayload } from "@zcode/shared";
export function aboutUpdatePresentation(result: UpdateCheckResultPayload, locale: Locale) {
  const zh = locale === "zh-CN";
  const check = zh ? "检查更新" : "Check for updates";
  switch (result.kind) {
    case "up-to-date":
      return {
        text: zh ? `已是最新版本 ${result.currentVersion}` : `Up to date: ${result.currentVersion}`,
        button: check,
      };
    case "available":
      return {
        text: zh ? `发现新版本 ${result.version}` : `New version: ${result.version}`,
        button: zh ? "查看更新" : "View update",
      };
    case "ready":
      return {
        text: zh ? `新版本 ${result.version} 已下载` : `Version ${result.version} downloaded`,
        button: zh ? "重启并更新" : "Restart and update",
      };
    case "downloading":
    case "already-downloading":
      return {
        text: `${zh ? "正在下载" : "Downloading"} ${result.version}${result.kind === "already-downloading" ? ` · ${result.progress}` : ""}`,
        button: check,
      };
    case "dev-skipped":
      return {
        text: zh
          ? "当前开发构建或发布渠道未启用自动更新"
          : "Automatic updates are unavailable for this build or channel",
        button: check,
      };
    case "error":
      return {
        text: `${zh ? "检查失败" : "Check failed"}: ${result.message}`,
        button: zh ? "重试" : "Retry",
      };
  }
}
