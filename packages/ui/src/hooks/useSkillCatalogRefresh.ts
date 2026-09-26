import { useEffect } from "react";
import type { IZCodeTaskService } from "@zcode/services";
import { logger } from "@/logger.js";

/** 对话经文件工具添加技能不会触发设置页的导入回调；用 Host 终态与焦点恢复重新读取目录事实。 */
export function useSkillCatalogRefresh({
  workspacePath,
  workspaceIdentity,
  taskService,
  enabled,
  refresh,
}: {
  workspacePath: string | null;
  workspaceIdentity?: string;
  taskService: Pick<IZCodeTaskService, "onDynamicWorkspaceEvent">;
  enabled: boolean;
  refresh: () => Promise<void>;
}): void {
  useEffect(() => {
    if (!enabled || !workspacePath) return;
    let disposed = false;
    let refreshing = false;
    let refreshAgain = false;
    const workspaceKey = workspaceIdentity?.trim() || workspacePath;
    const requestRefresh = async () => {
      if (disposed) return;
      if (refreshing) {
        refreshAgain = true;
        return;
      }
      refreshing = true;
      try {
        do {
          refreshAgain = false;
          await refresh();
        } while (!disposed && refreshAgain);
      } catch (error) {
        logger.warn("[skills] automatic catalog refresh failed", { error });
      } finally {
        refreshing = false;
      }
    };
    const subscription = taskService.onDynamicWorkspaceEvent({
      workspacePath,
      workspaceIdentity,
    })((event) => {
      if (
        event.type !== "workspace_task_list_changed" ||
        event.reason !== "task_status_changed" ||
        (event.workspaceIdentity?.trim() || event.workspacePath) !== workspaceKey
      )
        return;
      if (event.taskMeta?.status === "completed" || event.taskMeta?.status === "error") {
        void requestRefresh();
      }
    });
    const onFocus = () => void requestRefresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void requestRefresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      subscription.dispose();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, refresh, taskService, workspaceIdentity, workspacePath]);
}
