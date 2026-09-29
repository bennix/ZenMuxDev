# Studio PPT history

Generated decks are automatically saved after each completed page and edit. History is local to the application/browser origin, shared across Studio panels, not workspace or remote Host data. Existing memory-only decks have no migration source. No credentials, prompts, or discussion are stored; a short user topic and page HTML are retained. IndexedDB avoids localStorage's small synchronous quota.

Ownership: useStudioDeckHistory owns the active deck identity/pages. The IndexedDB adapter owns durable records. The list is a projection, newest first, containing title, updated time, and page count. Opening restores all editable pages and resets selection. Generation starts a new identity. Empty decks are not listed. Completed pages from interrupted runs remain available.

```text
page completion / edit → hook active deck → IndexedDB transaction → history projection
select history → load record → active deck / existing preview and export
delete selection → atomic delete + tombstones → clear deleted active deck → refresh list
```

Writes and deletes are ordered by IndexedDB transactions. Durable ID tombstones prevent queued writes or another open panel from resurrecting deleted decks; tombstones contain only IDs. Batch deletion is atomic and limited to selected IDs. UI confirms the count before permanent deletion. Opening/deleting is disabled during generation, editing and PDF export. Errors are visible; failed saves leave the active in-memory deck usable. Persistence is browser profile local and subject to available disk quota. HTML is opened only through the existing sandbox preview.

Acceptance: save multiple decks, remount/reload and reopen all pages; edit without duplicating entries; selected-only batch deletion; cancel leaves records intact; deletion followed by stale save cannot resurrect records; quota errors are surfaced. Browser interaction test covers save/reload/open/select/delete.
