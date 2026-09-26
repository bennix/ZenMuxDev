# Goal completion must apply only to the verified target

The verifier awaits a model request. During that await, the user may replace,
pause or clear the goal. Existing code updates by session ID alone, allowing the
old successful verification to complete a different or paused goal.

Reuse SessionStore as sole state owner. Extend updateTargetStatus with an optional
expected targetID/objective/status precondition. SQLite checks it in the same UPDATE
statement, returning null on mismatch. Existing unconditional caller semantics stay
unchanged. No schema migration. Verifier supplies the verified active target, emits
no status-change event on mismatch and returns a failed verification with an explicit
stale-result explanation. Current goal state remains authoritative.

```mermaid
sequenceDiagram
  participant Runtime
  participant Verifier
  participant Store as SessionStore
  Runtime->>Verifier: Verify goal A
  Runtime->>Store: User pauses/replaces/clears A
  Verifier-->>Runtime: Old result passed
  Runtime->>Store: Complete only if targetID/objective/status match A active
  Store-->>Runtime: null (precondition failed)
  Runtime->>Runtime: Discard success; do not emit completion
```

Test: successful matching update; replacement, pause, deletion and objective change
reject stale completion without changing current state. Desktop/mobile state comes
from the existing event/snapshot owner; no renderer state is added. This fixes the
in-flight mismatch at completion, not a general event-sourced goal revision design.
