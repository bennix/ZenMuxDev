import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsGroupCard, SettingsRow } from "./SettingsPageParts.js";
const BotsDialog = lazy(() =>
  import("@/BotsDialog.js").then((module) => ({ default: module.BotsDialog })),
);

export function WeixinPairingSettings({
  workspacePath,
  workspaceIdentity,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
}) {
  const { intl } = useZCodeIntl();
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "bots.weixinPairing.title" })}
          description={intl.formatMessage({ id: "bots.weixinPairing.description" })}
          control={
            <Button variant="outline" onClick={() => setOpen(true)}>
              {intl.formatMessage({ id: "bots.weixinPairing.open" })}
            </Button>
          }
        />
      </SettingsGroupCard>
      {open ? (
        <Suspense
          fallback={
            <div role="status" className="text-ui-caption">
              {intl.formatMessage({ id: "common.loading" })}
            </div>
          }
        >
          <BotsDialog
            open={open}
            onOpenChange={setOpen}
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            entryProvider="weixin"
          />
        </Suspense>
      ) : null}
    </>
  );
}
