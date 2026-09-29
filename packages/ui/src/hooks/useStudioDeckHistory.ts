import { useCallback, useEffect, useState } from "react";
import {
  deleteStudioDecks,
  listStudioDecks,
  saveStudioDeck,
  type StudioDeckRecord,
} from "@/store/studioDeckHistory.js";

export function useStudioDeckHistory() {
  const [pages, setPages] = useState<string[]>([]);
  const [active, setActive] = useState<{ id: string; title: string } | null>(null);
  const [records, setRecords] = useState<StudioDeckRecord[]>([]);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setRecords(await listStudioDecks());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!active || !pages.length) return;
    void saveStudioDeck({ ...active, pages, updatedAt: Date.now() })
      .then(refresh)
      .catch(() => setError(true));
  }, [active, pages, refresh]);
  return {
    pages,
    setPages,
    records,
    error,
    refresh,
    begin(title: string) {
      setPages([]);
      setActive({ id: crypto.randomUUID(), title: title.trim().slice(0, 120) || "PPT" });
    },
    open(record: StudioDeckRecord) {
      setActive({ id: record.id, title: record.title });
      setPages(record.pages);
    },
    async remove(ids: string[]) {
      try {
        await deleteStudioDecks(ids);
        if (active && ids.includes(active.id)) {
          setActive(null);
          setPages([]);
        }
        await refresh();
      } catch {
        setError(true);
      }
    },
  };
}
