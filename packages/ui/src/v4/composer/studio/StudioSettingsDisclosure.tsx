import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button.js";

export function StudioSettingsDisclosure({
  children,
  collapseLabel,
  expandLabel,
}: {
  children: ReactNode;
  collapseLabel: string;
  expandLabel: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const Icon = expanded ? ChevronUp : ChevronDown;
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        className="mb-2 h-7 gap-2 px-2 text-ui-caption"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        <Icon className="size-4" aria-hidden="true" />
        {expanded ? collapseLabel : expandLabel}
      </Button>
      {/* 只隐藏 DOM，不卸载表单，避免收起导致输入与附件状态丢失。 */}
      <div id={contentId} hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}
