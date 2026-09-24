/**
 * 对话框下方的控制开关。电脑控制和浏览器控制各自独立，可以同时打开。
 */
import { memo, useState, type ReactNode } from "react";
import { GlobeIcon, MonitorCogIcon } from "lucide-react";
import { ZCODE_CUA_OFFICIAL_PLUGIN_ID } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { useOptionalServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";
import { usePluginManagementStore } from "@/store/pluginManagementStore.js";

const BROWSER_USE_PLUGIN_ID = "browser-use@zcode-plugins-official";

function V4ComposerControlTogglesImpl() {
  const services = useOptionalServices();
  const { intl } = useZCodeIntl();
  const plugins = usePluginManagementStore((state) => state.plugins);
  const setEnabled = usePluginManagementStore((state) => state.setEnabled);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pluginComputerOn =
    plugins.find((plugin) => plugin.id === ZCODE_CUA_OFFICIAL_PLUGIN_ID)?.enabled === true;
  const pluginBrowserOn =
    plugins.find((plugin) => plugin.id === BROWSER_USE_PLUGIN_ID)?.enabled === true;
  // 选中态先跟手变色。插件开关失败时不能把已经按下的外观又弹回去。
  const [computerOn, setComputerOn] = useState(pluginComputerOn);
  const [browserOn, setBrowserOn] = useState(pluginBrowserOn);
  if (!services) return null;

  const toggle = (pluginId: string, enabled: boolean) => {
    if (pluginId === ZCODE_CUA_OFFICIAL_PLUGIN_ID) setComputerOn(enabled);
    if (pluginId === BROWSER_USE_PLUGIN_ID) setBrowserOn(enabled);
    const pluginService = services.pluginManagementService;
    if (!pluginService || pendingId) return;
    setPendingId(pluginId);
    void setEnabled(pluginId, enabled, pluginService).finally(() => {
      setPendingId((current) => (current === pluginId ? null : current));
    });
  };

  return (
    <div className="flex items-center gap-1" data-composer-collapse-priority="0">
      <ControlToggle
        pressed={computerOn}
        label={intl.formatMessage({ id: "chat.toolbar.control.computer" })}
        icon={<MonitorCogIcon className="size-4 shrink-0" aria-hidden />}
        onPressedChange={(next) => toggle(ZCODE_CUA_OFFICIAL_PLUGIN_ID, next)}
      />
      <ControlToggle
        pressed={browserOn}
        label={intl.formatMessage({ id: "chat.toolbar.control.browser" })}
        icon={<GlobeIcon className="size-4 shrink-0" aria-hidden />}
        onPressedChange={(next) => toggle(BROWSER_USE_PLUGIN_ID, next)}
      />
    </div>
  );
}

function ControlToggle({
  pressed,
  label,
  icon,
  onPressedChange,
}: {
  pressed: boolean;
  label: string;
  icon: ReactNode;
  onPressedChange: (next: boolean) => void;
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "secondary" : "ghost"}
      size="default"
      aria-pressed={pressed}
      aria-label={label}
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
