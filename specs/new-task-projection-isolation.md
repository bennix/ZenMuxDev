# New task projection isolation

SessionDataLayer owns per-session projections; SessionPane only holds a lease. A lease is visible
only for the same layer and shell session ID that acquired it. Null is the draft scope, not an
alias for the last task. Draft prewarm leases remain allowed within that draft scope.

```mermaid
sequenceDiagram
  User->>Shell: New task
  Shell->>SessionPane: sessionId = null
  SessionPane->>Projection: synchronously mask previous scope lease
  SessionPane->>SessionDataLayer: release old lease; acquire draft prewarm when ready
```

Never delete old conversation history. Desktop continuous and remote replay use identical
scope checks; remote layer replacement also masks the prior connection immediately. No delay
or clearing of the old session store is used. Acceptance: switch A→draft and A→B before effects
flush, old rows/errors/optimistic commands cannot be read; same-scope prewarm remains available;
same session ID on a replacement layer cannot expose old results.
UI scenario: complete A, click New task, assert empty conversation, send B and confirm no A
rows; reopen A and confirm history remains. Repeat on remote Web and during late A events.
