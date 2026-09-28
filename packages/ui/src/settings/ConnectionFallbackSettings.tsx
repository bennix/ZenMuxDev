import { useState } from "react";
import { completeNewModelSelection } from "@zcode/provider";
import type { ModelSelection } from "@zcode/shared/model-selection";
import { useSettings } from "@/hooks/useSettingService.js";
import { useModelSelectionView } from "@/hooks/useModelSelectionView.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { thoughtLevelLabelId } from "@/chat-input-toolbar/thoughtLevelOptions.js";

export function ConnectionFallbackSettings({
  workspacePath,
  workspaceIdentity,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
}) {
  const { settings, update } = useSettings();
  const { intl } = useZCodeIntl();
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const selection = settings?.modelConnectionFallback;
  const read = useModelSelectionView(workspacePath, undefined, workspaceIdentity, undefined, {
    selection: selection ?? null,
  });
  const view = read.state.status === "ready" ? read.state.view : null;
  const choices =
    view?.providers.flatMap((provider) => provider.models.map((model) => ({ provider, model }))) ??
    [];
  const selected = choices.find(
    (item) =>
      item.provider.providerId === selection?.providerId &&
      item.model.modelId === selection?.modelId,
  );
  const levels = selected?.model.config.optionSpecs.reasoningLevel.values ?? [];
  const save = async (value: ModelSelection | undefined) => {
    setSaving(true);
    setError(false);
    try {
      await update({ modelConnectionFallback: value ?? null });
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  const field =
    "h-8 min-w-0 max-w-full rounded-lg border border-input-border bg-input px-2 text-ui-base";
  return (
    <section className="space-y-2">
      <h3 className="text-ui-base font-medium">
        {intl.formatMessage({ id: "settings.fallback.title" })}
      </h3>
      <p className="text-ui-caption text-foreground-subtle">
        {intl.formatMessage({ id: "settings.fallback.description" })}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          className={field}
          disabled={!view || saving}
          aria-label={intl.formatMessage({ id: "settings.fallback.title" })}
          value={selection ? JSON.stringify([selection.providerId, selection.modelId]) : ""}
          onChange={(event) => {
            if (!event.target.value) {
              void save(undefined);
              return;
            }
            const [providerId, modelId] = JSON.parse(event.target.value) as [string, string];
            if (view) void save(completeNewModelSelection(view, { providerId, modelId }));
          }}
        >
          <option value="">{intl.formatMessage({ id: "settings.fallback.off" })}</option>
          {selection && !selected ? (
            <option value={JSON.stringify([selection.providerId, selection.modelId])}>
              {selection.modelId}
            </option>
          ) : null}
          {choices.map(({ provider, model }) => (
            <option
              key={JSON.stringify([provider.providerId, model.modelId])}
              value={JSON.stringify([provider.providerId, model.modelId])}
            >
              {provider.providerName} · {model.modelId}
            </option>
          ))}
        </select>
        {selection && levels.length > 0 ? (
          <select
            className={field}
            disabled={saving}
            value={selection.options?.reasoningLevel ?? ""}
            aria-label={intl.formatMessage({ id: "settings.fallback.effort" })}
            onChange={(event) =>
              void save({ ...selection, options: { reasoningLevel: event.target.value } })
            }
          >
            {!selection.options?.reasoningLevel ? (
              <option value="" disabled>
                —
              </option>
            ) : null}
            {levels.map((level) => (
              <option key={level} value={level}>
                {thoughtLevelLabelId(level)
                  ? intl.formatMessage({ id: thoughtLevelLabelId(level)! })
                  : level}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-ui-caption text-destructive">
          {intl.formatMessage({ id: "settings.fallback.saveFailed" })}
        </p>
      ) : null}
    </section>
  );
}
