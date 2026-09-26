import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";

export function WeixinAccessSetting({
  users,
  scanningUser,
  onChange,
}: {
  users?: string[];
  scanningUser?: string;
  onChange: (users: string[] | undefined) => void;
}) {
  const { intl } = useZCodeIntl();
  const persisted = (users ?? (scanningUser ? [scanningUser] : [])).join(", ");
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? persisted;
  const parsed = [...new Set(value.split(/[,，\s]+/u).filter(Boolean))];
  const invalid = parsed.some((user) => !/^[^\s@]+@im\.wechat$/u.test(user));
  const label = intl.formatMessage({ id: "bots.weixinAccess.title" });
  return (
    <SettingsGroupCard>
      <SettingsRow
        control={null}
        label={label}
        description={intl.formatMessage({ id: "bots.weixinAccess.description" })}
      />
      <div className="space-y-2 p-3">
        <Input
          aria-label={label}
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          aria-invalid={invalid}
        />
        {invalid ? (
          <p role="alert" className="text-ui-caption text-destructive">
            {intl.formatMessage({ id: "bots.weixinAccess.invalid" })}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={invalid || draft === null}
            onClick={() => {
              onChange(parsed);
              setDraft(null);
            }}
          >
            {intl.formatMessage({ id: "bots.weixinAccess.save" })}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onChange(undefined);
              setDraft(null);
            }}
          >
            {intl.formatMessage({ id: "bots.weixinAccess.reset" })}
          </Button>
        </div>
      </div>
    </SettingsGroupCard>
  );
}
