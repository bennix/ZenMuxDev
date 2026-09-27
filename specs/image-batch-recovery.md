# Image batch recovery
Persist each batch in the existing session_entries store (no new database schema).
Core owns checkpoints, keyed by session + model + analysis version + full batch input
fingerprint. Store only status, batch counters and completed analysis, never raw image
bytes. Save running before dispatch and completed before advancing. Failure becomes
interrupted. Cold resume changes stale running entries to interrupted; does no model
or external delivery IO. Existing SessionResumed/history hydration remains authoritative.

restart → existing session hydration → running checkpoints become interrupted → wait
user continue → same batch fingerprint → reuse completed results → run incomplete batch

An explicit short continuation input uses the preceding substantive task as the batch
analysis objective. Changed task/model/images invalidates the fingerprint, preventing
stale analysis reuse. Cancellation and uncertain in-flight API results cannot be exactly
resumed: only completed and durably saved batches are reused. Save failures stop progress.
Nonpersisted sessions retain their existing ephemeral behavior. No cross-session sharing.
Acceptance: recreate runtime/store client and reuse completed batch without model call;
running interrupted at restore with no execution; changed input misses cache; failed
save does not claim completion; continuation finds original task. Normal conversation,
tools and artifact delivery continue to use their existing persistence semantics.
