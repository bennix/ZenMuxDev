import { useEffect, useState } from "react";
import { usePlatform } from "@/hooks/usePlatform.js";
import { dispatchCodeCommentAddToChat } from "@/lib/codeCommentContext.js";
import { logger } from "@/logger.js";

export function useCodeWorkbench(workspacePath: string, workspaceIdentity?: string) {
  const platform = usePlatform();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      platform.onCodeWorkbenchContext?.((context) => {
        // 身份优先，避免切换 workspace 后把旧编辑器的选区送入新任务。
        if (
          (context.workspaceIdentity?.trim() || context.workspacePath) !==
          (workspaceIdentity?.trim() || workspacePath)
        )
          return;
        const accepted = dispatchCodeCommentAddToChat({
          ...context,
          sourceTitle: context.sourcePath.split(/[\\/]/).pop() || context.sourcePath,
        });
        if (context.requestId)
          void platform.acknowledgeCodeWorkbenchContext?.(context.requestId, accepted);
      }),
    [platform, workspaceIdentity, workspacePath],
  );
  return {
    available: Boolean(platform.openCodeWorkbench),
    pending,
    error,
    async open() {
      if (!platform.openCodeWorkbench || pending) return null;
      setPending(true);
      setError(null);
      try {
        return await platform.openCodeWorkbench({ workspacePath, workspaceIdentity });
      } catch (cause) {
        logger.warn("Code workbench startup failed", {
          reason: cause instanceof Error ? cause.name : "unknown",
        });
        setError(String(cause));
        return null;
      } finally {
        setPending(false);
      }
    },
  };
}
