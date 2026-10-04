# Known Gaps Register

Canonical register of identified architecture/product gaps. Every major milestone MUST update
this register when it closes: add new gaps, mark resolved, and reconcile placements.

Statuses: `OPEN`, `DEFERRED_BY_DESIGN`, `SCHEDULED`, `RESOLVED`, `OBSOLETE`.

| Gap | Title | Origin | Status | Planned handling | Notes |
|---|---|---|---|---|---|
| GAP-001 | Core Entity Type seeding remains client-bootstrap | 17.3 | OPEN, non-blocking | 20.1 Architecture Health Check | CORE types seed idempotently via browser; write authority goes to trusted admin for Domain types |
| GAP-002 | Module schema versioning/publish is still on the existing client-authoritative path | 17.3 | SCHEDULED | before 24 | Blocks Form Import/Digitization readiness |
| GAP-003 | Entity list search is prefix-based | 17.3 | DEFERRED_BY_DESIGN | 33 Global Search | No canonical full-text index yet |
| GAP-004 | Administration History lacks rich actor/user filter UI | 17.3 | DEFERRED_BY_DESIGN | 20.1 revisit | Bounded filter augmentation later |
| GAP-005 | Shared-workspace multi-user Ledger live E2E deferred | 17.1.1 | OPEN | 20.1 regression | Requires membership staging |
| GAP-006 | Ledger historical backfill bounded to ~1000 records | 17.1.1 | DEFERRED_BY_DESIGN | 30.1 scaling review | Continuation command possible without schema change |
| GAP-007 | Pre-book CANCELLED records are not fabricated into historical Ledger evidence | 17.1.1 | DEFERRED_BY_DESIGN | 30.1 / 35 legal review only if compliance requires | No fake history |
| GAP-008 | Ledger sources don't yet support full RECORD_TYPE / multi-Module source model | 17.1.1 | DEFERRED_BY_DESIGN | 30.1 | Module type source covers v1 requirement |
| GAP-009 | Category rename/admin lifecycle | 17.2 | RESOLVED (17.3) | — | AdminActions + trusted commands |
| GAP-010 | Category drag-drop organization UX | 17.2 | SCHEDULED | 19 | Deterministic up/down present; drag/drop deferred |
| GAP-011 | Application-wide technical identifier UX hardening | 17.4 | RESOLVED (17.4) | — | Ledger code optional/auto; entity type code optional/auto; moduleCode optional already; user-code proposals validated collision-safe |
| GAP-012 | Roadmap numbering conflict: "17.5 Data Import & Mapping" appeared in earlier docs while authoritative placement is Step 31.1 | 17.2 docs | RESOLVED (17.4) | — | Removed redundant 17.5 row; authoritative placement is 31.1 |
| GAP-013 | Module Page / View Composition Engine has no final roadmap step | 17.3 area | OPEN | 20.1 decision | Not implemented yet; declarative Module Page Definition planned |
| GAP-014 | Agent-ready capability contracts not formally standardized across future Engines | 17.4 | OPEN | 21 | Architectural requirement only; no orchestrator now |
| GAP-015 | Records temporarily exposed technical/fallback titles during module metadata resolution | 17.4 accepted finding | RESOLVED (Step 18) | — | Root cause: module metadata had no cache slot and row labels rendered a technical fallback before it arrived; fixed by putting module metadata into the workspaceQueryCache and only showing a stable placeholder while cold |
| GAP-016 | Calendar revisit reloaded visible state even with warmed cache | 17.4 accepted finding | RESOLVED (Step 18) | — | Root cause: windowBounds keys contained live time-of-day, creating a new cache entry on every revisit; fixed by day-level normalization |
| GAP-017 | Conversation member add/remove is not yet user-manageable; WORKSPACE-type conversations not implemented | 18 | OPEN | 19 | Membership lifecycle lives next to Step 19 org UX; Workspace broadcast channels can live inside Channels |
| GAP-018 | Message edit/delete and richer threading (nested replies) deferred | 18 | DEFERRED_BY_DESIGN | 20.1 review | Simple reply-to exists; edit/delete/forking-thread trees explicit skip; messageEditPolicy may evolve later |
| GAP-019 | Chat member-of conversation reads all workspace context conv — boundary between CONTEXT and restricted-context conversations needs team policy | 18 | OPEN | 20.1 review | Depends on future Record/task restriction policy |

Rule: known gaps never excuse security/data-integrity defects. They pace roadmap-level investments only.
