import { Switch } from "@/components/ui/switch.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";

export function WeixinEchoSetting({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const { intl } = useZCodeIntl();
  const label = intl.formatMessage({ id: "bots.weixinEcho.title" });
  return (
    <SettingsGroupCard>
      <SettingsRow
        label={label}
        description={intl.formatMessage({ id: "bots.weixinEcho.description" })}
        control={<Switch checked={enabled} onCheckedChange={onChange} aria-label={label} />}
      />
    </SettingsGroupCard>
  );
}
