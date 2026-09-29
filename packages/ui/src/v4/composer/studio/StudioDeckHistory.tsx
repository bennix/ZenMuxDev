import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { StudioDeckRecord } from "@/store/studioDeckHistory.js";

export function StudioDeckHistory({
  records,
  disabled,
  error,
  onOpen,
  onDelete,
  onRefresh,
}: {
  records: StudioDeckRecord[];
  disabled: boolean;
  error: boolean;
  onOpen: (record: StudioDeckRecord) => void;
  onDelete: (ids: string[]) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ids = selected.filter((id) => records.some((record) => record.id === id));
  const blocked = disabled || deleting;
  const label = (key: string, values?: Record<string, number>) =>
    intl.formatMessage({ id: `chat.studio.history.${key}` }, values);
  return (
    <div className="mb-2 rounded-xl border border-border p-2 text-ui-caption">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
          setConfirming(false);
          void onRefresh();
        }}
      >
        {label("title")} ({records.length})
      </Button>
      {error ? (
        <p role="alert" className="text-destructive">
          {label("error")}
        </p>
      ) : null}
      {expanded ? (
        <div className="space-y-2">
          <p className="text-muted-foreground">{label("local")}</p>
          {records.length ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={blocked}
                    checked={ids.length === records.length}
                    onChange={(event) => {
                      setSelected(event.target.checked ? records.map((record) => record.id) : []);
                      setConfirming(false);
                    }}
                  />
                  {label("all")}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={blocked || !ids.length}
                  onClick={() => setConfirming(true)}
                >
                  {label("delete", { count: ids.length })}
                </Button>
              </div>
              {confirming ? (
                <div
                  role="group"
                  aria-label={label("confirm", { count: ids.length })}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span>{label("confirm", { count: ids.length })}</span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={blocked || !ids.length}
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await onDelete(ids);
                        setSelected([]);
                        setConfirming(false);
                      } finally {
                        setDeleting(false);
                      }
                    }}
                  >
                    {label("confirmDelete")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={deleting}
                    onClick={() => setConfirming(false)}
                  >
                    {label("cancel")}
                  </Button>
                </div>
              ) : null}
              <ul className="max-h-60 space-y-1 overflow-y-auto">
                {records.map((record) => (
                  <li key={record.id} className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={record.title}
                      disabled={blocked}
                      checked={ids.includes(record.id)}
                      onChange={(event) => {
                        setSelected(
                          event.target.checked
                            ? [...ids, record.id]
                            : ids.filter((id) => id !== record.id),
                        );
                        setConfirming(false);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={blocked}
                      className="min-w-0 flex-1 justify-start"
                      onClick={() => onOpen(record)}
                    >
                      <span className="truncate">{record.title}</span>
                    </Button>
                    <span className="shrink-0 text-muted-foreground">
                      {label("pages", { count: record.pages.length })} ·{" "}
                      {new Date(record.updatedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>{label("empty")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
