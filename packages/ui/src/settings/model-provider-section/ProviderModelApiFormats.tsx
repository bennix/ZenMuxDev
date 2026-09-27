import type { ProviderApiType } from "@zcode/provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  resolveProviderConnectionApiFormatOptions,
  resolveProviderConnectionApiFormatDisplayLabel,
} from "./ProviderApiFormatSelect.js";

export function ProviderModelApiFormats({
  models,
  value,
  onChange,
}: {
  models: readonly { modelId: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const overrides = JSON.parse(value) as Record<string, ProviderApiType | null>;
  return (
    <div className="space-y-2">
      <p className="text-ui-base text-foreground-subtle">
        {intl.formatMessage({ id: "settings.modelProvider.modelApiFormat" })}
      </p>
      {models.map(({ modelId }) => (
        <div key={modelId} className="space-y-1">
          <label
            className="block break-all text-ui-caption text-foreground-subtle"
            htmlFor={`model-api-${modelId}`}
          >
            {modelId}
          </label>
          <Select
            value={overrides[modelId] ?? "inherit"}
            onValueChange={(next) =>
              onChange(
                JSON.stringify({ ...overrides, [modelId]: next === "inherit" ? null : next }),
              )
            }
          >
            <SelectTrigger
              id={`model-api-${modelId}`}
              data-testid={`model-api-${modelId}`}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">
                {intl.formatMessage({ id: "settings.modelProvider.modelApiFormat.inherit" })}
              </SelectItem>
              {resolveProviderConnectionApiFormatOptions().map((format) => (
                <SelectItem key={format} value={format}>
                  {resolveProviderConnectionApiFormatDisplayLabel(intl, format)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
