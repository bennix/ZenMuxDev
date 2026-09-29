import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

const CONTEXT_WINDOW_TIERS = [
  { id: "32k", tokens: "32000", label: "32K" },
  { id: "128k", tokens: "128000", label: "128K" },
  { id: "200k", tokens: "200000", label: "200K" },
  { id: "500k", tokens: "500000", label: "500K" },
  { id: "1m", tokens: "1000000", label: "1M" },
  { id: "1.05m", tokens: "1050000", label: "1.05M" },
] as const;

export function ContextWindowTierPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (tokens: string) => void;
}) {
  const { intl } = useZCodeIntl();
  return (
    <div className="mt-2">
      <div className="mb-1 text-ui-base text-foreground-subtle">
        {intl.formatMessage({ id: "settings.modelProvider.contextWindowTiers" })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CONTEXT_WINDOW_TIERS.map((tier) => {
          const active = selected === tier.tokens;
          return (
            <Button
              key={tier.id}
              type="button"
              size="sm"
              variant={active ? "secondary" : "outline"}
              aria-pressed={active}
              onClick={() => onSelect(tier.tokens)}
            >
              {tier.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
