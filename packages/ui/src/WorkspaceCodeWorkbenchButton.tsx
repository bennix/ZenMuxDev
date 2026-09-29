import { createPortal } from "react-dom";
import { CodeXml, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useCodeWorkbench } from "@/hooks/useCodeWorkbench.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function WorkspaceCodeWorkbenchButton({
  workspacePath,
  workspaceIdentity,
  remote,
  onOpenUrl,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  remote: boolean;
  onOpenUrl?: (url: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const workbench = useCodeWorkbench(workspacePath, workspaceIdentity);
  if (!workbench.available || !onOpenUrl) return null;
  const label = intl.formatMessage({
    id: workbench.pending ? "workbench.preparing" : "workbench.open",
  });
  return (
    <div className="relative flex items-center">
      <Button
        variant="ghost"
        size="sm"
        disabled={remote || workbench.pending || !workspacePath}
        title={remote ? intl.formatMessage({ id: "workbench.remoteUnavailable" }) : label}
        data-testid="workspace-code-workbench"
        onClick={() => {
          void workbench.open().then((result) => {
            if (result) onOpenUrl(result.url);
          });
        }}
      >
        {workbench.pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <CodeXml className="size-4" />
        )}
        <span className="text-ui-sm">{label}</span>
      </Button>
      {workbench.error
        ? createPortal(
            <span
              role="alert"
              className="fixed top-16 right-4 z-50 w-80 rounded-lg border border-border bg-popover p-3 text-ui-sm text-destructive"
            >
              {intl.formatMessage({ id: "workbench.failed" })} {workbench.error}
            </span>,
            document.body,
          )
        : null}
    </div>
  );
}
