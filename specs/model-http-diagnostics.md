# Model HTTP diagnostics

The model adapter owns per-physical-fetch diagnostics. Existing logger context is retained;
a generated httpRequestId joins the HTTP milestones (distinct from SDK attempt IDs).
No protocol, retry, timeout, admission, or UI behavior changes.

Sequence: SDK attempt → HTTP started → response headers → first body bytes → body completed / failed / cancelled.
Fetch failures before headers emit failed with phase=headers. HTTP error statuses are recorded
before existing business-error normalization. First bytes do not imply model content: SSE comments
and keepalives count as transport bytes only. Existing SDK content milestones remain authoritative.
Desktop continuous and mobile replayable delivery remain unchanged; these are local info logs,
not new client events. No extra network calls, retries, body cloning or eager body consumption.

Only provider ID, HTTP correlation ID, method, status, elapsed milliseconds, byte counts and
allowlisted bounded server request IDs are recorded. Never log URLs, credentials, arbitrary
headers, request/response bodies or raw error messages. Errors retain their identity.

Acceptance: streamed bytes unchanged; milestones ordered and emitted once; HTTP 402 recorded;
fetch/body failures rethrown; cancellation reaches underlying reader; secrets absent from logs.

SSE diagnosis extension: count comment, data and event lines before compatibility transforms.
Keep only six ASCII prefix bytes per line, never retain values; CR and LF both delimit lines.
Emit the first occurrence of each line kind and cumulative counts on termination. This separates
transport keepalives from actual provider data without recording response contents.
For bounded data lines (at most 4096 bytes), classify JSON using a fixed allowlist of
Anthropic event types, OpenAI choices, error, or other_data. Log each kind once per request;
never log JSON values. Oversized lines are skipped without affecting forwarded bytes.

Retry UI: map SSE stalled/disconnected protocol reason codes to localized user-facing text;
other codes use a generic connection-failure message. Never present internal fault keys as prose.
