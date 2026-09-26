# Knowledge, Goal and Office integration

## Product scope

User requests automatic indexing of submitted inputs and their attachments, persistent
retrieval with source references, robust `/goal`, read-only Office pagination, and the
complete OfficeCLI command surface with composer templates. This document tracks the
whole scope; individual capabilities are not considered delivered merely by documenting them.

## Owners and sequencing

```text
submitted input → runtime CommandInbox admission → durable session message
                                                → knowledge indexing job
query → workspace-scoped index → bounded cited retrieval attachment → model

/goal → existing runtime target owner → persisted target and usage → verifier
                                     → continuation or explicit terminal status

composer Office template → existing builtin prompt expansion → runtime tool executor
                                                           → OfficeCLI → saved file
saved file → existing file preview service → read-only page/sheet navigation
```

Desktop continuous events and mobile replayable snapshots derive from the same runtime.
The renderer must not own a second goal or indexing queue. Workspace isolation uses
`workspaceIdentity?.trim() || workspacePath`; paths are used only for file operations.

## Knowledge rules

- Original submitted inputs and extracted attachments remain attributable to session,
  message and source. Unsubmitted drafts are excluded. Replayed admission is idempotent.
- Keep raw sources separately from compiled Markdown summaries and backlinks. Generated
  summaries are derived data, never replacements for originals.
- Embedding model identity and dimension belong to index metadata. A model change creates
  a rebuild, never a mixed vector space. Local embedding is the provisional default;
  cloud embedding requires explicit configuration and visible indexing status.
- Retrieval content is untrusted quoted data with references and a bounded context budget.
  Add retrieval after the stable prompt prefix so indexing does not invalidate that prefix.
- Deletion removes source chunks, vectors and derived references. Failed indexing is
  visible and retryable without preventing normal conversation.

## Goal rules

- Reuse persisted SessionGoal and CommandInbox. Existing budget accounting, completion
  verifier and compaction reminders remain authoritative.
- Acceptance must map every explicit requirement to evidence. Missing evidence is not
  completion. Persist progress and blockers separately from transient model context.
- Repeated unavailable dependencies must lead to a visible blocked state, not infinite
  continuation. Resume starts a new attempt; budget exhaustion cannot mark success.
- Stable goal instructions remain in the cacheable prefix; changing progress is appended.

## Office rules

- Offer `/office`, `/office-create`, `/office-edit`, `/office-preview` templates in the
  existing slash catalog (both composer surfaces); templates expand through the existing
  builtin prompt path, not a separate renderer command executor.
- Ship an OfficeCLI skill with the application. Discover actual supported syntax with
  `officecli --help` and command help, preserving the full upstream command surface.
- Detect missing executable and explain setup errors; never report a successful document
  edit without a successful command and output-file validation. Do not silently run
  OfficeCLI's installer, which can modify unrelated agent configurations.
- Use normal tool permissions, cancellation and output limits for commands. Flush resident
  document changes before an external preview/export reads the file.
- Previews are read-only and page/sheet navigation must expose every available page.
  No editing canvas is required by this scope. Unsupported legacy formats must say so.

## Acceptance and delivery tracking

- [ ] Replayed and cross-workspace input indexing, restart recovery, deletion and retry.
- [ ] Local/cloud embedding configuration and cited retrieval during conversation.
- [ ] Persistent goal acceptance, blocker handling, budget and compaction regression tests.
- [ ] OfficeCLI runtime available in release bundles on supported platforms.
- [ ] Office templates discoverable and executable through the existing composer pipeline.
- [ ] DOCX/PPTX page and XLSX sheet navigation tested in browser.
- [ ] Root and CLI typecheck/lint executed; failures reported accurately.

## References

Design references: local GenOffice (Apache-2.0), iOfficeAI/OfficeCLI (Apache-2.0),
deepseek-ai/deepseek-harness goal subsystem, goal-engineering and qm. Inspect licenses
before copying code; this integration does not import upstream application internals.

### OfficeCLI runtime distribution decision

The bundled skill owns a platform-neutral launcher. It downloads a pinned release on
first use into the user's ZenCode tools cache, reports download progress to stderr,
verifies the repository-pinned SHA-256, then forwards argv and stdio to the native
executable. It never runs upstream agent-configuration installers. Subsequent use is
offline. Unsupported platforms, failed downloads and hash mismatches are errors.
Concurrent downloads use separate temporary files and atomic publication. No shell
interpolation is used. Updating OfficeCLI requires updating version and asset hashes
in source; full upstream command access is preserved without maintaining a subset.

### Knowledge implementation boundary

The first embedding adapter uses the local Ollama `/api/embed` interface (default
model `bge-m3`) through the existing HTTP port. No user data is sent to a cloud by
default. Missing Ollama/model leaves raw sources intact and reports indexing failure;
that must not be advertised as a working vector index. Settings are stored in the
knowledge root's `config.json`, with validated endpoint/model, and index fingerprints
prevent querying vectors produced by another model. The runtime captures admitted
user text once by session/message ID. Binary attachment text extraction and compiled
wiki generation are separately tracked deliverables, not implied by text indexing.

## Additional requested scope (not yet delivered)

- Horizon (`Thysrael/Horizon`): UI entry, source collection, AI scoring, discussion
  extraction, entity background, cross-source deduplication, bilingual digests and
  delivery through configured channels. Verify upstream coverage and MIT license
  before integration; do not assume every described channel is implemented upstream.
- Weixin: user subsequently requested one milestone at a time, prioritizing settings
  pairing and ping/pong. See `weixin-ilink-echo.md`; other work retains its current
  incomplete state until this milestone's live gate.
- `/goal` auxiliary reference: `qybaihe/mu`; inspect its API and license first.
- ZenMux Jev: user-provided model identifier `typesafe/jev-1.13`, configurable in
  Settings. Laya reference `malevrigns/agent-jev`; inspect actual runtime and weight
  licensing before adding download/progress/removal UI. No weight download yet.

User clarification: `agent-jev` is the local Laya backend and may cooperate with
ZenMux `typesafe/jev-1.13`. Preserve two configurable backends and inspect their
actual typed decision protocols before choosing delegation or fallback behavior.

- Ponytail (`DietrichGebert/ponytail`): inspect its pre-implementation necessity
  checks and apply compatible guidance before generating code. User-provided star
  counts are not verification evidence. Prefer existing capabilities and minimal
  changes; do not add a new runtime solely to reproduce a prompt checklist.

Local Laya backend selection must be mutually exclusive: `agent-jev` or
`Contrastive-LM/CLM`. Cloud ZenMux Jev remains independently configurable. Switching
local backends should unload/stop the previous backend; validate actual API, weights,
platform requirements and model license before implementing either installer.

CLM is a candidate scorer/ranker, not an action generator. Main-model/tool proposals
remain the action source. Cache action vectors with encoder revision, projection-head
revision and action content; state embeddings have a separate key. UI must distinguish
projection-head size from the Qwen3-8B encoder and report supported compute/runtime
requirements. User-supplied speedups and benchmark percentages require verification
against upstream conditions; they are not product guarantees. Inspect vLLM pooling
and clm-serve support on the selected host before offering installation on macOS.

Weight lifecycle clarification: both local backends can be installed independently
and coexist on disk. Each has separate download/version/size/delete status. Exclusive
selection means the active backend, not an installation restriction. Cooperative
execution is a separate explicit configuration; never load both by default.

Verified reference notes: Horizon already documents iLink delivery. Its independent
poller must not run beside ZenCode's poller; integrate outbound briefing delivery
through the existing Bot owner and stored context token. CLM documents a CPU scoring
service plus a GPU vLLM Qwen3-8B encoder; treat remote encoder configuration as distinct
from local head installation. agent-jev documents a Qwen3-0.6B backbone. No backend
weights or external delivery channels have been enabled by this task yet.

- Browser agent: absorb applicable behavior from `browser-use/browser-use` through
  the existing browser plugin. See `browser-agent-integration.md` for verified
  baseline, ownership and unexecuted acceptance scenarios. Research/specification
  only; no new browser runtime shipped yet.

Office preview acceptance must render a real OOXML DOCX fixture through the actual
PreviewPaneOfficeDocxContent component, traverse all 20 pages using its controls,
and verify page bounds and source-switch reset. DOM-only helper tests are not enough.
