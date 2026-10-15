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
| GAP-013 | Module Page / View Composition Engine has no final roadmap step | 17.3 area | OPEN | Step 35 (post-Platform foundation) | Waiting for Step 35 finalized placement per Step 20 dependency-aware alignment |
| GAP-014 | Agent-ready capability contracts not formally standardized | 17.4 | OPEN | Step 21 | Capability Registry + Dependency Graph covers this |
| GAP-015 | Records temporarily exposed technical/fallback titles during module metadata resolution | 17.4 accepted finding | RESOLVED (Step 18) | — | Root cause: module metadata had no cache slot and row labels rendered a technical fallback before it arrived; fixed by putting module metadata into the workspaceQueryCache and only showing a stable placeholder while cold |
| GAP-016 | Calendar revisit reloaded visible state even with warmed cache | 17.4 accepted finding | RESOLVED (Step 18) | — | Root cause: windowBounds keys contained live time-of-day, creating a new cache entry on every revisit; fixed by day-level normalization |
| GAP-017 | Room/channel semantics conflated: created ROOM type with topic, INVITE_ONLY/WORKSPACE_VISIBLE visibility, Group snapshot invitations; persistent Channels deferred (post-Step 20) | 18 | RESOLVED (Step 19 v2) | — | `CHANNEL` is not shipped yet; conversation exposes the grouped "Room" creating via `ch_` legacy type "ROOM" (visible on the Conversation doc, governing access semantics) |
| GAP-018 | Message edit/delete and richer threading deferred | 18 | OPEN | 20.1 review | Simple reply-to remains; edit/delete and thread trees still later |
| GAP-019 | Chat context conversation access semantics | 18 | OPEN | 20.1 review | Requires a product/security decision before tightening |

**(Step 20 closure note)** — GAP-001–008 open items remain acknowledged; GAP-011/gap-015/gap-016/gap-017 are correctly closed; nothing new opened by this architecture milestone.
