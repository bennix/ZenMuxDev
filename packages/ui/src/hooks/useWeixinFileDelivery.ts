import { useCallback, useRef, useState } from "react";
import { useOptionalServices } from "./useServices.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function useWeixinFileDelivery(scope: {
  workspacePath?: string;
  workspaceIdentity?: string;
}) {
  const services = useOptionalServices();
  const { locale } = useZCodeIntl();
  const [sending, setSending] = useState(false);
  const active = useRef(false);
  const send = useCallback(
    async (path: string) => {
      if (active.current || !services || !scope.workspacePath) return;
      active.current = true;
      setSending(true);
      toast(
        locale.startsWith("zh")
          ? "正在发送到最近连接的微信…"
          : "Sending to the latest Weixin channel…",
      );
      try {
        const result = await services.botsService.deliverWeixinFile({
          action: "send",
          path,
          workspacePath: scope.workspacePath,
          workspaceIdentity: scope.workspaceIdentity,
        });
        if (result.sent) toast(locale.startsWith("zh") ? "已发送到微信" : "Sent to Weixin");
      } catch (error) {
        toast(
          error instanceof Error
            ? error.message
            : locale.startsWith("zh")
              ? "微信发送失败"
              : "Weixin delivery failed",
        );
      } finally {
        active.current = false;
        setSending(false);
      }
    },
    [services, scope.workspacePath, scope.workspaceIdentity, locale],
  );
  return {
    send,
    sending,
    available: Boolean(services && scope.workspacePath),
    label: locale.startsWith("zh")
      ? sending
        ? "正在发送到微信…"
        : "发送到微信（最近连接）"
      : sending
        ? "Sending to Weixin…"
        : "Send to Weixin (latest channel)",
  };
}
