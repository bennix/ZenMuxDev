import { useStudioMediaLibrary } from "@/hooks/useStudioMediaLibrary.js";
import { useStudioRepairModelStore } from "@/store/studioRepairModelStore.js";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { IMAGE_CATALOG, VIDEO_CATALOG } from "./studioMediaCatalog.js";
import { type StudioMediaLibrary } from "./studioMediaStore.js";

export function StudioMediaSettings() {
  const { intl } = useZCodeIntl();
  const repairModel = useStudioRepairModelStore((state) => state.modelId);
  const setRepairModel = useStudioRepairModelStore((state) => state.setModelId);
  const { library, save, loading, error } = useStudioMediaLibrary();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const update = (next: StudioMediaLibrary) => {
    setSaving(true);
    void save(next)
      .then(
        () => setSaveError(""),
        (error) => setSaveError(String(error)),
      )
      .finally(() => setSaving(false));
  };
  return (
    <fieldset disabled={loading || saving} className="mt-4 space-y-4">
      {Boolean(saveError || error) && (
        <p role="alert" className="text-ui-caption text-destructive">
          {saveError || String(error)}
        </p>
      )}
      <section className="rounded-xl border border-border bg-card p-4">
        <label htmlFor="studio-repair-model" className="mb-3 block text-ui-base font-medium">
          {intl.formatMessage({ id: "settings.studioMedia.repairModel" })}
        </label>
        <input
          id="studio-repair-model"
          value={repairModel}
          onChange={(event) => setRepairModel(event.target.value)}
          placeholder={intl.formatMessage({ id: "settings.studioMedia.followWriter" })}
          className="h-8 w-full rounded-lg border border-border bg-background px-2 font-mono text-ui-caption"
          aria-describedby="studio-repair-help"
        />
        <p id="studio-repair-help" className="mt-2 text-ui-caption text-muted-foreground">
          {intl.formatMessage({ id: "settings.studioMedia.repairHelp" })}
        </p>
      </section>
      <ModelList
        title={intl.formatMessage({ id: "settings.studioMedia.imageTitle" })}
        listId="studio-image-models"
        ids={library.imageIds}
        suggestions={IMAGE_CATALOG.map((model) => model.id)}
        defaultId={library.defaultImageId}
        onChange={(imageIds, defaultImageId) => update({ ...library, imageIds, defaultImageId })}
      />
      <ModelList
        title={intl.formatMessage({ id: "settings.studioMedia.videoTitle" })}
        listId="studio-video-models"
        ids={library.videoIds}
        suggestions={VIDEO_CATALOG.map((model) => model.id)}
        defaultId={library.defaultVideoId}
        onChange={(videoIds, defaultVideoId) => update({ ...library, videoIds, defaultVideoId })}
      />
    </fieldset>
  );
}

function ModelList({
  title,
  listId,
  ids,
  suggestions,
  defaultId,
  onChange,
}: {
  title: string;
  listId: string;
  ids: string[];
  suggestions: readonly string[];
  defaultId: string;
  onChange: (ids: string[], defaultId: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const available = suggestions.filter((id) => !ids.includes(id));
  const add = () => {
    const id = draft.trim();
    if (!id) return;
    onChange([id, ...ids.filter((item) => item !== id)], id);
    setDraft("");
    listRef.current?.scrollTo({ top: 0 });
  };
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2 text-ui-base font-medium">{title}</h3>
      <p role="status" className="mb-3 break-all text-ui-caption text-muted-foreground">
        {intl.formatMessage({ id: "settings.studioMedia.currentDefault" }, { model: defaultId })}
      </p>
      <div className="mb-3 flex gap-2">
        <input
          value={draft}
          list={listId}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              add();
            }
          }}
          placeholder={intl.formatMessage({ id: "settings.studioMedia.modelId" })}
          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 font-mono text-ui-caption"
        />
        <datalist id={listId}>
          {available.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        <Button type="button" variant="outline" className="h-8 px-3 text-ui-caption" onClick={add}>
          {intl.formatMessage({ id: "settings.studioMedia.add" })}
        </Button>
      </div>
      <div ref={listRef} className="flex max-h-80 flex-col gap-2 overflow-auto">
        {ids.map((id) => (
          <div
            key={id}
            className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${defaultId === id ? "border-primary bg-primary/10" : "border-border"}`}
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 font-mono text-ui-caption">
              <input
                type="radio"
                name={`${listId}-default`}
                value={id}
                checked={defaultId === id}
                onChange={() => onChange(ids, id)}
                className="h-4 w-4 shrink-0 accent-primary"
              />
              <span className="truncate">{id}</span>
            </label>
            <Button
              type="button"
              variant="ghost"
              className="h-7 px-2 text-ui-caption"
              onClick={() =>
                onChange(
                  ids.filter((item) => item !== id),
                  defaultId === id ? "" : defaultId,
                )
              }
            >
              {intl.formatMessage({ id: "settings.studioMedia.remove" })}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
