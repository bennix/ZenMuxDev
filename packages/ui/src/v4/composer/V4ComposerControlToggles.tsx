/**
 * 对话框下方的控制开关。电脑控制和浏览器控制各自独立，可以同时打开。
 */
import { memo, useEffect, useRef, type ReactNode } from "react";
import { GlobeIcon, MonitorCogIcon } from "lucide-react";
import { ZCODE_CUA_OFFICIAL_PLUGIN_ID } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { useOptionalServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";
import { usePluginManagementStore } from "@/store/pluginManagementStore.js";

const BROWSER_USE_PLUGIN_ID = "browser-use@zcode-plugins-official";

interface V4ComposerControlTogglesProps {
  workspacePath: string;
  workspaceIdentity?: string;
}

function V4ComposerControlTogglesImpl({
  workspacePath,
  workspaceIdentity,
}: V4ComposerControlTogglesProps) {
  const services = useOptionalServices();
  const { intl } = useZCodeIntl();
  const plugins = usePluginManagementStore((state) => state.plugins);
  const loadedWorkspacePath = usePluginManagementStore((state) => state.workspacePath);
  const loadedWorkspaceIdentity = usePluginManagementStore((state) => state.workspaceIdentity);
  const loading = usePluginManagementStore((state) => state.loading);
  const error = usePluginManagementStore((state) => state.error);
  const lastFailedPluginId = usePluginManagementStore((state) => state.lastFailedPluginId);
  const togglingPluginId = usePluginManagementStore((state) => state.togglingPluginId);
  const initialize = usePluginManagementStore((state) => state.initialize);
  const setEnabled = usePluginManagementStore((state) => state.setEnabled);
  const initializedKeyRef = useRef<string | null>(null);
  // 原入口用局部 useState 记按钮颜色，插件缺失或 RPC 失败时仍会显示为开启。
  // 现在只读插件 store 的实际状态，并在工作区切换时重新加载该工作区概览。
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const loadedWorkspaceKey = loadedWorkspaceIdentity?.trim() || loadedWorkspacePath;
  const hasCurrentOverview = Boolean(
    workspaceKey && loadedWorkspaceKey === workspaceKey && !loading,
  );
  const computerPlugin = hasCurrentOverview
    ? plugins.find((plugin) => plugin.id === ZCODE_CUA_OFFICIAL_PLUGIN_ID)
    : undefined;
  const browserPlugin = hasCurrentOverview
    ? plugins.find((plugin) => plugin.id === BROWSER_USE_PLUGIN_ID)
    : undefined;

  useEffect(() => {
    const pluginService = services?.pluginManagementService;
    if (!pluginService || !workspacePath || initializedKeyRef.current === workspaceKey) return;
    initializedKeyRef.current = workspaceKey;
    void initialize({ workspacePath, workspaceIdentity, pluginService });
  }, [initialize, services, workspaceIdentity, workspaceKey, workspacePath]);

  if (!services) return null;

  const toggle = (pluginId: string, enabled: boolean) => {
    const pluginService = services.pluginManagementService;
    if (!pluginService || togglingPluginId || !hasCurrentOverview) return;
    void setEnabled(pluginId, enabled, pluginService);
  };

  const missingComputer = hasCurrentOverview && !computerPlugin;
  const missingBrowser = hasCurrentOverview && !browserPlugin;
  const failedControl =
    error &&
    (lastFailedPluginId === ZCODE_CUA_OFFICIAL_PLUGIN_ID ||
      lastFailedPluginId === BROWSER_USE_PLUGIN_ID);

  return (
    <div className="flex items-center gap-1" data-composer-collapse-priority="0">
      <ControlToggle
        pressed={computerPlugin?.enabled === true}
        label={intl.formatMessage({ id: "chat.toolbar.control.computer" })}
        icon={<MonitorCogIcon className="size-4 shrink-0" aria-hidden />}
        disabled={!computerPlugin || Boolean(togglingPluginId)}
        unavailableReason={
          missingComputer
            ? intl.formatMessage({ id: "chat.toolbar.control.computerUnavailable" })
            : undefined
        }
        onPressedChange={(next) => toggle(ZCODE_CUA_OFFICIAL_PLUGIN_ID, next)}
      />
      <ControlToggle
        pressed={browserPlugin?.enabled === true}
        label={intl.formatMessage({ id: "chat.toolbar.control.browser" })}
        icon={<GlobeIcon className="size-4 shrink-0" aria-hidden />}
        disabled={!browserPlugin || Boolean(togglingPluginId)}
        unavailableReason={
          missingBrowser
            ? intl.formatMessage({ id: "chat.toolbar.control.browserUnavailable" })
            : undefined
        }
        onPressedChange={(next) => toggle(BROWSER_USE_PLUGIN_ID, next)}
      />
      {missingComputer ? (
        <span role="status" className="text-ui-caption text-warning">
          {intl.formatMessage({ id: "chat.toolbar.control.computerUnavailable" })}
        </span>
      ) : null}
      {failedControl ? (
        <span role="alert" className="text-ui-caption text-warning">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function ControlToggle({
  pressed,
  label,
  icon,
  disabled,
  unavailableReason,
  onPressedChange,
}: {
  pressed: boolean;
  label: string;
  icon: ReactNode;
  disabled: boolean;
  unavailableReason?: string;
  onPressedChange: (next: boolean) => void;
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "secondary" : "ghost"}
      size="default"
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      title={unavailableReason}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "h-7 w-fit justify-center gap-1 rounded-lg border px-2 py-1.5 text-ui-base transition-colors",
        pressed
          ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
          : "border-border bg-background text-foreground-subtle hover:bg-muted",
      )}
    >
      {icon}
      <span className="inline-flex whitespace-nowrap">{label}</span>
    </Button>
  );
}

export const V4ComposerControlToggles = memo(V4ComposerControlTogglesImpl);
