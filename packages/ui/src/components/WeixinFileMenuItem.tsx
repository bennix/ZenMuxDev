import { ContextMenuItem } from "@/components/ui/context-menu.js";
import { useWeixinFileDelivery } from "@/hooks/useWeixinFileDelivery.js";

export function WeixinFileMenuItem(props: {
  path: string;
  workspacePath?: string;
  workspaceIdentity?: string;
  disabled?: boolean;
}) {
  const delivery = useWeixinFileDelivery(props);
  return (
    <ContextMenuItem
      disabled={props.disabled || !delivery.available || delivery.sending}
      onSelect={(event) => { event.preventDefault(); void delivery.send(props.path); }}
    >
      {delivery.label}
    </ContextMenuItem>
  );
}
