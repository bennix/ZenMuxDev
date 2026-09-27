# User-requested delivery and acceptance ledger

Updated 2026-09-27. A source file or spec is not evidence of deployment or live
acceptance. Preserve all items until implemented and verified. This ledger is an
index; detailed behavior belongs to each feature spec.

| Request | Evidence now | Remaining acceptance |
| --- | --- | --- |
| PPT all 20 pages, sequential generation, saved partial progress | Existing Studio implementation | Re-run a 20-page deck and interrupted resume |
| PPT retries, malformed HTML recovery, <=5 repair rounds then retain/continue | Existing generation/repair code | Verify network and invalid-layout cases |
| Configurable repair model and visible AI output | Studio settings and generator present | Exercise selected model and streamed repair progress |
| Applied themes and readable layouts | Existing Studio layout rules | Compare multiple themes; overflowing and tiny text fixtures |
| Element list/canvas bidirectional selection, visible handles, move/resize | Existing Studio editor | Real browser interactions including nested/tiny elements |
| Moved/resized geometry in exported PPTX | Existing editable exporter | Open edited export and compare coordinates |
| WPS parity: arrows, shapes, images/SVG, no blank pages | Existing exporter | Open original user fixture and regenerated output in WPS |
| ZenCoder X-Title on model requests | shared/zenmux.ts constant present | Audit all actual request routes and header precedence |
| ZenMux macOS icon across app surfaces, vivid dimensional treatment | zenmux-app-icon.md and prior source changes | Audit packaged icon, Dock, startup and settings |
| Reported screenshot failures and no-change edits | edit-no-change.md; commit 564e60f | Recheck associated runtime case; no image-only assumptions |
| Skills installed in AI chat appear in Settings | conversation-skill-install.md; commit 7351007 | Verify create/install/refresh end-to-end |
| All submitted inputs and attachments → vector RAG + cited wiki | Incomplete local-text prototype | Durable queue, attachment extraction, settings, deletion, wiki and retrieval |
| Robust /goal, acceptance, persistence, budgets, compaction and cache | Existing runtime target owner; stale verifier CAS regression passed (0b0c47b) | Blocked status migration and complete regression suite |
| mu auxiliary goal tooling | Reference recorded | Inspect interface/license and implement useful integration |
| Read-only Office preview and full page/sheet navigation | DOCX navigation implemented; real 20-page DOCX browser test passed | PPTX/XLSX fixtures and packaged app acceptance |
| Permanent OfficeCLI full command surface + composer templates | Pinned 1.0.152 launcher and composer templates implemented (afcb35f); command tests passed | Packaged runtime and UI execution |
| Horizon UI, sources, scoring, discussions, dedup, background, bilingual digests | Reference research only | Integration and acceptance for each advertised source/channel |
| Weixin B Settings pairing + ping/pong | User confirmed pong; PR #1 ready | Done for B scope |
| Weixin C allowlist, typing, configured AI text replies | Source and settings browser tests passed; draft PR #2 | Packaged app and live authorized AI/typing response |
| Weixin D images/files and inbound voice transcription | Inbound CDN/AES/PDF metadata and voice transcription tested; default-model image generation/editing and outbound image upload implemented with protocol/browser tests | Outbound files; live generated-image and multimodal acceptance; separate PR |
| Configurable cloud Jev typesafe/jev-1.13 | Shared constants and Studio references | Settings and decision-routing audit |
| Local Laya: agent-jev or CLM active backend | Reference research only | Runtime contracts, platform support and integration |
| Separate optional weights for both local backends | Scope clarified, no downloads | Version/progress/size/delete; coexist on disk, no default dual loading |
| Ponytail necessity/complexity check | Reference recorded | Inspect/license and integrate with existing coding workflow |
| browser-use workflow improvements | browser-agent-integration.md; existing internal plugin | Gap tests and concrete upstream-derived improvements |

## Sequencing and constraints

Weixin B/C/D remain separate changes. Do not mark live AI/media acceptance based on
an echo test. Reuse existing Agent, browser, Bot and goal owners. Keep unrelated local
changes. Goal schema migration awaits the previously requested user confirmation;
continue non-schema work while it is pending. Downloading model weights and enabling
external digest delivery have not happened. Do not imply otherwise.

## Latest Weixin document incident

The supplied PDF has 24 pages and matches cached inbound bytes exactly. The live
Agent read pages 1–20, drifted into web research, then ended with
`model_request_cancelled`; who cancelled is unknown. Commit a1a1d3b exposes total
PDF pages, constrains attachment-only summary scope, notifies cancellation, and
keeps typing through preparation and response delivery. Fourteen protocol/PDF tests
passed. This is not yet proof of live summary delivery or Weixin typing display.

Both root and CLI typechecks passed. Root lint retains four errors (two oversized
existing source files and two generated release-artifacts files). Architecture has
zero violations. The clean integration build excludes the unfinished knowledge
prototype. Commit a82f9e6 additionally repairs macOS ASAR metadata in the source
packaging hook; two regression tests passed. Packaged/live acceptance is pending.
