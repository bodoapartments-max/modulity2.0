# Modulity 2.0 — Master Architecture & Product Roadmap

## Status

Step 11.0 planning/audit. No runtime code changed. Physical package reorganization deferred to Step 11.1.

## 1. Executive Summary

Modulity 2.0 has a solid canonical foundation: Core data (Entity, Module, Record), deterministic Module versioning, a generic FormRenderer, Ledger/Audit, Reports/Widgets, Agent/Automat planning, and the first operational Capability Engine (Calendar). The architecture is intentionally a single-repository modular monolith with strong inward dependency direction.

Step 11.0 identified three categories of work:

1. **Hygiene / structural cleanup** — move engine-specific code out of generic core directories, extract shared design-system primitives, split the AppShell route monolith, remove infrastructure-layer authorization backdoors. These are prerequisites for scaling the codebase and onboarding new engines.
2. **Missing product foundations** — Record lifecycle/actions, Form Import/Digitization seam, Attachments UI, Sharing/Folders/Favorites UI, Chat completion, custom DatePicker. Many have Core services already; they need Feature surfaces.
3. **Future Capability Engines** — Approval, Workflow, Task, Scheduling/Booking, Inventory, Document, generic Notification, Integrations. These must be built *after* (1) and (2) because they depend on canonical Record actions, attachments, and a stable package structure.

## 2. Canonical Invariants (non-negotiable)

- The **Record** is the canonical operational object. No per-view copies.
- **Core works without agents.** Agents propose; Core validates/executes.
- **Dependencies point inward:** `app` → `features`/`modules`/`engines`/`agents` → `core` → `infrastructure`.
- **Core has no React, no Firebase, no Feature UI.**
- **Capability Engines** operate around canonical data; they do not own business-data stores.
- **Security is outside the UI.**

## 3. Current-State Matrix

| Area | Status | Owner | Current Implementation | Major Gap | Dependencies | Recommended Step |
|---|---|---|---|---|---|---|
| Core Data (Entity, Record, Module, FormSchema) | EXISTS | CORE | `src/core/data/`, `src/modules/` | Trusted submission still client-side for normal Records | Cloud Functions authority | Step 12 — Trusted Record Submission |
| Module Versioning & Provenance | EXISTS | CORE | `moduleVersion.js`, `moduleService.js`, `record.js` | None major | — | Maintain |
| Form Renderer & Field Registry | EXISTS | MODULE | `src/modules/forms/` | Select/Textarea/Table/Toast design primitives now exist; Checkbox/Radio not yet extracted | design-system | Step 11.1 + Step 13 |
| Entity Management | EXISTS | FEATURE | `src/features/entities/` | Logic lives in pages; no `model.js` | — | Step 11.1 refactor |
| Record List / Detail / History | EXISTS | FEATURE | `src/features/records/` | Saved views, bulk lifecycle ops, generated PDF still deferred | design-system | Step 14 (done) — see `docs/RECORD_UX.md` |
| Record Lifecycle / Actions | EXISTS (trusted foundation) | CORE+FEATURE | `recordCommand` contract 1.1.0 + policy + transition model; trusted UPDATE_DRAFT/SUBMIT/priority/archive/restore/cancel | Approve/reject/assign/complete reserved for later | Cloud Functions authority | Step 15 (done) — `docs/TRUSTED_RECORD_COMMANDS.md` |
| Ledger & Audit | EXISTS (trusted backend) | CORE | `src/core/ledger/`, `src/core/audit/`, trusted `ledgerCommand` + audit-in-transaction | Trusted cancel/void entries deferred; pre-16 audit `_timestamp` inconsistency in old dev data | trusted backend | Step 16 (done) — `LEDGER_ARCHITECTURE.md`, `AUDIT_ARCHITECTURE.md`, ADR-0008 |
| Reports & Widgets | EXISTS | CORE+FEATURE | `src/core/analytics/`, `src/features/reports/`, `src/features/widgets/` | `WidgetCard` cross-feature import; inline widget definition logic | package cleanup | Step 11.1 |
| Notifications | EXISTS (generic capability) | CORE+FEATURE | `src/core/notifications/`, `functions/src/notificationEngine.js`, Notification Center | delivery/* trusted notification migration deferred; per-user policy deferred | trusted commands | Step 17 (done) — `NOTIFICATION_ARCHITECTURE.md`, ADR-0009 |
| Chat / Conversations | PARTIAL | CORE+FEATURE | `conversation.js`, `ChatPage` | No conversation creation/member selection UI | — | Step 18 |
| Sharing / Folders / Favorites | PARTIAL | CORE | `secureShare.js`, `recordFolderService.js`, `userRecordState.js` | No user-facing Feature UI | — | Step 19 |
| Attachments / Files | PARTIAL | CORE | `file.js`, `fileService.js`, `fileStorageContract.js` | No upload/download UI | design-system FileUpload | Step 20 |
| Calendar Capability Engine | EXISTS | CAPABILITY+ENGINE | `src/core/capabilities/calendarEngine.js`, `src/features/calendar/` | Engine factory is hardcoded to calendar; engine code lives in core | package cleanup | Step 11.1 |
| Generic Capability Infrastructure | EXISTS | CAPABILITY | `capabilityContracts.js`, `capabilityEngineRegistry.js`, `capabilityDefinitionService.js` | No engine-factory registration seam; `CapabilityBinding` unused | package cleanup | Step 11.1 |
| Agent Infrastructure | EXISTS | AGENT | `src/agents/contracts/`, `registry/`, `orchestrator/`, `providers/` | Only deterministic test adapter; no LLM provider | entitlement/billing | Step 21 |
| Workspace Architect / Automat Planning | EXISTS | AGENT | `src/agents/planning/` | Keyword classification only; no live AI | Agent provider adapters | Step 21 |
| Automat Trusted Apply | EXISTS | INFRASTRUCTURE | `functions/src/automatApplyEngine.js` | Dev-only entitlement grant hardcoded for `modulity-2-dev` | billing/entitlement | Step 22 |
| Workspace Reset | EXISTS | INFRASTRUCTURE | `functions/src/workspaceReset.js` | Binary Storage cleanup deferred | File storage adapter | Step 23 |
| Design System | EXISTS | DESIGN_SYSTEM | `src/design-system/` primitives | Checkbox/Radio not yet extracted; other primitives added | — | Step 13 |
| Infrastructure Wiring | EXISTS | INFRASTRUCTURE | `src/infrastructure/services.js`, `repositories.js` | `services.js` has import-time bridge side effects; `automatPlanning.js` violates layer direction | — | Step 11.1 |
| Form Import / Digitization | MISSING | AGENT+FEATURE | Contracts only in docs | No OCR, document understanding, or import UI | Module Designer | Step 24 |
| Approval Engine | MISSING | CAPABILITY | Architecture only in docs | Needs Record action model + permissions | Step 15 | Step 25 |
| Workflow Engine | MISSING | CAPABILITY | Architecture only | Needs Record action model + task/notification | Step 15, Task, Notification | Step 26 |
| Task Engine | MISSING | CAPABILITY | None | Decide canonical Record vs Capability | Record actions | Step 27 |
| Scheduling / Booking Engine | MISSING | CAPABILITY | `datetime-range` field exists | No availability/conflict engine | Calendar, Record actions | Step 28 |
| Inventory Engine | MISSING | CAPABILITY | Architecture only | Needs stock projection model | Record actions | Step 29 |
| Document Engine | MISSING | CAPABILITY | Architecture only | Needs attachments + templates | Attachments | Step 30 |
| Integrations / API-first | MISSING | INFRASTRUCTURE | `src/integrations/` is a README placeholder | No external API, webhooks, service identities | Auth/entitlement | Step 31 |
| Billing / Entitlements | MISSING | INFRASTRUCTURE | Contracts in docs | No plan/subscription implementation | — | Step 32 |
| Search | MISSING | CORE/INFRASTRUCTURE | Prefix search on Entity lists only | No global/workspace search | Indexing strategy | Step 33 |
| Mobile / Responsive | PARTIAL | FEATURE | Layouts are responsive | Explicit 375px/320px verification missing for new features | design-system | Per-feature QA |
| Internationalization / Timezone | PARTIAL | DESIGN_SYSTEM | Native date pickers follow OS locale | No explicit timezone policy for `datetime` | Product decision | Step 34 |

## 4. Architecture Debt Register

| ID | Description | Severity | Layer | Risk | Recommended Step |
|---|---|---|---|---|---|
| AD-001 | Calendar engine/runtime and validator hardcoded in `src/core/capabilities/` mixed with generic capability contracts | MEDIUM | CORE/CAPABILITY | Adding engines requires editing generic core files | Step 11.1 — move to `engines/calendar/` |
| AD-002 | `capabilityRuntime.js` has `if (engineId === 'calendar')` with no factory registration seam | MEDIUM | CAPABILITY | Blocks second engine without core edits | Step 11.1 — add `engineFactories` map |
| AD-003 | `src/infrastructure/automatPlanning.js` imports `src/agents/*` and contains dev-only entitlement resolver (layer-direction violation) | MEDIUM | INFRASTRUCTURE | Security-relevant authorization lives in the wrong layer; blocks clean package boundaries | Step 11.1 — move to `src/agents/infrastructure/` or feature composition |
| AD-004 | `services.js` starts AuditBridge and NotificationBridge as import side effects | MEDIUM | INFRASTRUCTURE | Fragile init order; hard to test in isolation | Step 11.1 — explicit `bootstrap()` called by `App` |
| AD-005 | `EntityReferenceField.jsx` imports `services` directly (presentational component → infrastructure) | MEDIUM | FEATURE/DESIGN | Violates layer direction; hard to test/reuse | Step 11.1 — inject entity list loader via prop/hook |
| AD-006 | `WidgetCard` imported across features (`dashboard` → `widgets`) | LOW | FEATURE | Cross-feature coupling | Step 11.1 — move to `design-system` or shared UI |
| AD-007 | `AppShell.jsx` route table is a monolith that lazy-loads all 36 pages | LOW | APP | Large file; per-feature route registration preferred | Step 11.1 — per-feature route modules |
| AD-008 | `Header.jsx` uses `window.location.href` and `window.location.hash` instead of router navigation | LOW | FEATURE | Full page reloads; poor UX | Step 11.1 / Step 14 |
| AD-009 | Notification refresh uses custom `window` event instead of Event Bus | LOW | FEATURE | Ad-hoc coupling; inconsistent architecture | Step 17 |
| AD-010 | `functions/scripts/build-shared.mjs` copies 16 files manually; no completeness check | MEDIUM | INFRASTRUCTURE | Silent drift when core files move; reorganization risk | Step 11.1 — generate list or use shared package |
| AD-011 | `moduleService.js` legacy fallback code-reservation check is race-prone | LOW | CORE | Duplicate moduleCode possible under race | Step 12 |
| AD-012 | Event Bus is a mutable global singleton imported directly | LOW | CORE | Testability and future distribution | Step 16 / future distributed events |
| AD-013 | `core/data/entityPresentation.js` and `recordListPresentation.js` are UI-ish concerns inside Core | LOW | CORE | Blurring of presentation vs domain | Step 11.1 — move to `shared/` or feature layer |
| AD-014 | `core/analytics/` engines live inside Core despite being read-capability engines | LOW | CORE | Consistency with Capability Engine architecture | Step 11.1 — evaluate move to `engines/analytics/` |

## 5. Product Debt Register

| ID | Description | Severity | Depends On | Recommended Step |
|---|---|---|---|---|
| PD-001 | No Form Import / Digitization UI or document-understanding seam | HIGH | Module Designer | Step 24 |
| PD-002 | No Attachment/File upload UI | HIGH | design-system FileUpload | Step 20 |
| PD-003 | No Sharing / Send / Folders / Favorites UI despite Core services | HIGH | design-system, Record actions | Step 19 |
| PD-004 | No workflow-style Record actions (approve/reject/assign/complete); generic trusted lifecycle foundation landed in Step 15 | HIGH | Core lifecycle | Step 25+ |
| PD-005 | No Approval Engine | HIGH | PD-004, permissions | Step 25 |
| PD-006 | No Workflow Engine | MEDIUM | PD-004, Task, Notification | Step 26 |
| PD-007 | No Scheduling/Booking conflict/availability engine | MEDIUM | Calendar, `datetime-range` | Step 28 |
| PD-008 | No Inventory projection | MEDIUM | Record actions | Step 29 |
| PD-009 | No Document/PDF generation | MEDIUM | Attachments | Step 30 |
| PD-010 | Missing design-system primitives: Checkbox, Radio | MEDIUM | — | Step 13 |
| PD-011 | Chat cannot create conversations or select members | MEDIUM | — | Step 18 |
| PD-012 | No global/workspace search | MEDIUM | Indexing | Step 33 |
| PD-013 | No generated PDF for Records (browser print + single-Record JSON export landed in Step 14; deterministic PDF still missing) | LOW | Document engine | Step 30 |
| PD-014 | No saved views / filters for Record lists (toolbar filters exist from Step 14, but no persisted view definitions) | LOW | Record UI | Step 14 follow-up / later |
| PD-015 | Native date/datetime picker locale behavior inconsistent with Monday-first calendar grids | LOW | design-system pickers | Step 13 (optional custom pickers) |
| PD-016 | No explicit responsive verification at 768px/375px for new features | LOW | QA process | Per-feature acceptance |

## 6. Master Dependency Graph

```text
Design-System primitives
        ↓
App shell + routing bootstrap
        ↓
Features (Entities, Modules/Designer, Records, Calendar, Reports, ...)
        ↓
Engines (Calendar, Analytics, future Approval/Workflow/Task/Scheduling/Inventory/Document)
        ↓
Capability infrastructure (contracts, registry, definitions, bindings)
        ↓
Core (data, workspace, ledger, audit, events)
        ↓
Infrastructure (Firebase adapters, wiring, config, Cloud Functions)
```

Hard prerequisites:

- **Record Lifecycle/Actions (Step 15)** → Approval (Step 25), Workflow (Step 26), Task (Step 27), Scheduling (Step 28), Inventory (Step 29).
- **Attachments UI (Step 20)** → Document Engine (Step 30), Form Import (Step 24).
- **Module Designer + FormRenderer** → Form Import/Digitization (Step 24).
- **Capability Engine factory seam + package cleanup (Step 11.1)** → every future engine.
- **Trusted backend / Cloud Functions authority (Step 12)** → fully server-authoritative submission, approval, workflow transitions.
- **Design-system primitives (Step 13)** → most product UI improvements.

Independent streams:

- Chat completion (Step 18) and Sharing/Folders/Favorites (Step 19) can proceed in parallel once design-system basics exist.
- Agent live providers (Step 21) and Billing (Step 32) are largely independent of product engines until entitlement enforcement is needed.

## 7. Proposed Next Milestones

| Step | Name | Purpose | Prerequisites | Owner | Why before next |
|---|---|---|---|---|---|
| 11.1 | Physical Package Reorganization | Make generic/engine/feature/agent boundaries explicit without behavior changes | Audit complete | ALL | Unblocks parallel engine work |
| 12 | Trusted Record Submission Function | Move normal Record creation behind a Cloud Function to close the trusted-submission gap | Step 11.1 | INFRASTRUCTURE | Required before approval/workflow can be authoritative |
| 12.1 | Record Command Recovery, Module Policy & Browser Verification | Stabilize Step 12: recover stale operations, enforce ACTIVE-only module submission, verify real browser path | Step 12 | INFRASTRUCTURE+QA | Closes Step 12 before design-system work |
| 13 | Design-System Primitives | Add Select, Textarea, Table, DataGrid, Pagination, Toast, FileUpload, Tabs | Step 11.1 | DESIGN_SYSTEM | Required for Attachments, Sharing, Chat, etc. |
| 14 | Record UX Hardening | Hardened list (DataGrid, filters, safe sort, cursor pagination, page-scoped search), detail (header/metadata/actions), draft edit + autosave, copy via trusted create, print/JSON export. Deferred: saved views, bulk lifecycle, generated PDF | Step 13 | FEATURE | COMPLETE — see `docs/RECORD_UX.md` |
| 15 | Generic Record Actions / Lifecycle | COMPLETE — trusted command boundary extended (UPDATE_DRAFT, SUBMIT_RECORD, SET_PRIORITY, ARCHIVE_RECORD, RESTORE_RECORD, CANCEL_RECORD), pure action policy + transition model, Rules deny client lifecycle/data mutations. Approve/reject/assign/complete stay reserved | Steps 12, 13 | CORE+FEATURE | Foundation for Approval/Workflow |
| 16 | Trusted Ledger/Audit Backend | COMPLETE — `ledgerCommand` (CREATE_LEDGER_BOOK, REGISTER_LEDGER_ENTRY); journal+entry+block+linkage+Audit in one transaction; Audit entries atomic with mutations; browser Authorship denied; browser AuditBridge retired; concurrency proven (20 same / 50 distinct) | Step 12 | INFRASTRUCTURE | Removes client-trust limitations |
| 17 | Generic Notification Capability | COMPLETE — canonical contract, intent+template+recipient-seam, trusted server engine, deterministic dedupe, IN_APP delivery router, hardened Notification Center, browser read-state only | Step 15 (actions produce events) | CAPABILITY | Needed for Approval/Workflow alerts |
| 17.1 | Universal Form Ledger & Historical Form Viewer | COMPLETE — submissions auto-register into per-Module Form Books (trusted chain, deterministic op ids); cancels cross out entries (never erased); Form Books list with counters; Book page with blocks/filters; read-only Historical Form Viewer with Prev/Next on the exact historical schema; reset leaves no ghost data (`recordOperations` added to reset contract); live E2E green | Step 16 | CORE+FEATURE | Restores the V1 paper-register experience on trusted foundations |
| 17.1.1 | Configurable Ledger Books & Universal Sources | COMPLETE — evidence≠organization: typed declarative `sourceDefinition` (MODULE v1), `provisionedBy` AUTO/USER with USER-configured register preferred, deterministic trusted backfill of historical evidence into new books, config page with source selector, honest counters/empty state, live E2E green | Step 17.1 | CORE+FEATURE | The "create the register months later" case is real |
| 17.2 | Module Organization, Categories & Personal Selection | COMPLETE — canonical moduleCategories (shared manual+Automat), categoryId on Modules, personal selection/order/viewMode on userWorkspacePreferences, My Modules search/filter/grouped/flat/customize, All Modules navigator that always discovers authorized-hidden Modules, auto technical code generation with collision-safe suffixes, Rules+reset coverage, ADR-0012 | Steps 15, 17.1 | CORE+FEATURE | Scales beyond tens of Modules without UX collapse |
| 17.3 | Trusted Entity & Module Administration + Change History | COMPLETE — typed `adminCommand` engine; Entity Type/Entity/Module/Module Category lifecycle; typed dependency analyzer gates hard Delete; server-generated technical codes; durable before/after Audit; Administration History UI; CONTACT Core Entity Type; 13 engine tests; ADR-0013 | Step 17.2 | CORE+FEATURE | Closes the protected-config client debt |
| 17.4 | Platform-Wide Technical Identifier UX Hardening + Navigation fixes | COMPLETE — Ledger code optional/auto, Entity-Type code optional/auto (already), Module code proposal validated collision-safe client→server; Calendar revisit uses workspaceQueryCache stale-while-revalidate (no reload flash); Records/Modules/Reports "Refreshing…" banner removed (no more layout shift on background refresh); Known Gaps Register established (docs/KNOWN_GAPS_REGISTER.md) | Step 17.3 | FEATURE+UX | GAP-011 resolved; GAP-012 reconciled (see 31.1) |
| 18 | Workspace Chat & Contextual Conversations | COMPLETE — Conversations/Messages as canonical workspace subcollections via `chatCommand` callable; DIRECT/GROUP/CONTEXT types with deterministic ids; Notification intents reuse Step 17 channel; see ADR-0014 and docs/CHAT_AND_CONTEXTUAL_CONVERSATIONS.md | Step 17.4 | CORE+FEATURE | Conversations != Records != Messages; context references typed, never business data |
| 19 | Organization, Chat Rooms, Communication Context & UX Stability | COMPLETE — ROOM conversation type with topic + INVITE_ONLY/WORKSPACE_VISIBLE visibility + Group snapshot resolution (Group→Room server-side, no auto-members on later group changes); RoomCreateRoom dialog with people+groups invite selection; ROOM_ADD_MEMBER / ROOM_REMOVE_MEMBER trusted ops (Room-owner only); Ledge/People/Groups revisit stability retained; HANDOFF continuity doc; GAP-010/GAP-017 closed | Step 18 | CORE+FEATURE+UX | GROUP ≠ ROOM ≠ future CHANNEL. Persistent channels are future work |


| 20.1 | Architecture Health Check | Planned — GAP-001, GAP-004, GAP-005, and decision on GAP-013 (Module Page Composition Engine placement) | 17.4+ | ARCH | Routine consolidation point |
| 21 | Agent Capability Contracts | Planned — formal capability/discovery contract standard (GAP-014) | post-20.1 | AGENT+ARCH | No orchestrator yet |
| 24 | Form Import / Digitization | Requires GAP-002 (client-side publish) resolved BEFORE start | after 21 | AGENT+FEATURE | Hard prerequisite |
| 30.1 | Scaling Review | GAP-006, GAP-007, GAP-008 review at scale | 30 | SCALING | Ledger/API tuning |
| 31 | Integrations Foundation | Foundation for GAP-012 | after 28 | INFRA | See 31.1 |
| 31.1 | Data Import & Mapping Engine | AUTHORITATIVE placement (GAP-012) — first formal Engine Reference Implementation; ENGINE_DEVELOPMENT_GUIDE.md is derived here | after 31 | INFRA+ENGINE | Will start the formal engine authoring guide |
| 18 | Chat Completion | Conversation creation, member selection, @mentions foundation | Step 13 | FEATURE | Closes collaboration loop |
| 19 | Sharing, Folders & Favorites UI | Surface existing Core services in the UI | Step 13 | FEATURE | Core services already exist |
| 20 | Attachments UI | File upload/download in Records/Entities/Chat | Step 13 | FEATURE+INFRA | Prerequisite for Documents |
| 21 | Agent Live Provider Adapters | Add optional OpenAI/Anthropic/local adapters behind entitlement gate | Step 11.1, Billing prep | AGENT | Enables real AI planning |
| 22 | Production Entitlement Enforcement | Replace dev-only grants with subscription-backed resolver | Step 21 readiness | INFRASTRUCTURE | Required before paid features |
| **23** | Rules / Decision Engine � VERIFIED: deterministic evaluator (src/core/rules) with DecisionResult + TransitionIntent; zero mutations; rules ? policy ? permission; supported closing intents `evaluate` based on canonical BusinessEvents | 22 | Workspace Reset Storage Cleanup | Add Firebase Storage cleanup adapter | Step 11.1 | INFRASTRUCTURE | Security/compliance gap |
| 24 | Form Import / Digitization | Photo/scan/PDF → proposed FormSchema → Designer review → publish | Steps 13, 20 | AGENT+FEATURE | Major product differentiator |
| 25 | Approval Engine | Generic approval definitions and trusted actions on Records | Steps 15, 17, 22 | CAPABILITY | Enables holiday/expense/leave approvals |
| 26 | Workflow Engine | Multi-step state machines over canonical Records | Steps 15, 17, 25 | CAPABILITY | Automation beyond single approval |
| 27 | Task Engine | Decide and implement task projection/action model | Steps 15, 26 | CAPABILITY | Workflow creates tasks |
| 28 | Scheduling / Booking Engine | Resource availability and conflict detection over `datetime-range` + EntityReference | Steps 15, Calendar | CAPABILITY | Uses Record actions for bookings |
| 29 | Inventory Engine | Derived stock projection from movement Records | Steps 15, Record actions | CAPABILITY | Warehouse/retail operations |
| 30 | Document Engine | Templates, PDF generation, signature placeholders | Steps 20, 24 | CAPABILITY | Record → document |
| 31 | Integrations Foundation | External API surface, webhooks, service identities | Steps 22, 16 | INFRASTRUCTURE | Connect to outside world |
| 32 | Billing Implementation | Plans, subscriptions, usage counters, entitlement enforcement | Step 22 | INFRASTRUCTURE | Commercial readiness |
| 33 | Global Search | Workspace-scoped full-text/indexed search | Step 11.1, indexing | INFRASTRUCTURE | Scale UX |
| 34 | Internationalization / Timezone | Explicit i18n and timezone policy | Product decision | DESIGN_SYSTEM | Global deployments |

## 8. Step 11.1 Migration Notes

- **Goal:** behavior-preserving package reorganization.
- **No persistence changes.** No Firestore migrations, no Rules changes, no URL/route changes, no canonical ID changes.
- **Allowed:** MOVE_ONLY, MOVE_AND_IMPORT_UPDATE, SMALL_BOUNDARY_EXTRACTION.
- **Not allowed:** behavioral rewrites, schema changes, Firestore collection renames.
- Use multiple logical commits.
- Update `functions/scripts/build-shared.mjs` if copied files move.

See `docs/PACKAGE_ARCHITECTURE.md` for the concrete move map and dependency policy.

## 9. Terminology

| Term | Meaning |
|---|---|
| Workspace | Operating context: Personal or Organization. All data is scoped to a Workspace. |
| User | Authenticated account identity. |
| Person | Canonical entity representing a human in a workspace. |
| Employee | Core Entity Type representing a worker/role holder. |
| Membership | Link between User and Organization with role/status. |
| Role | Named collection of permissions. |
| Permission | Fine-grained capability string. |
| Group | Organizational grouping of users. |
| Entity Type | Typed schema definition for persistent business objects (CORE or DOMAIN). |
| Entity | Persistent business thing/person/place/resource instance. |
| Module | Definition of a business process and its FormSchema. |
| FormSchema | Declarative input structure rendered by FormRenderer. |
| Record | Canonical operational occurrence/submission. |
| Module Version | Immutable historical snapshot of a Module. |
| Capability Engine | Reusable behavior around canonical data (e.g., Calendar). |
| Capability Definition | Declarative configuration selecting canonical sources for an engine. |
| Capability Binding | Association between engine contract, definition reference, and source. |
| Capability View | User-facing projection powered by an engine. |
| Agent | Planning/configuration intelligence; never authoritative. |
| BuildPlan | Reviewable configuration proposal from an Agent. |
| Feature | User-facing product experience. |
| Infrastructure | External/platform-specific implementation (Firebase adapters, config, Functions). |
| Ledger | Durable numbered register of Records. |
| Audit | Append-only accountability record. |

## 10. Repository Strategy

Single-repository modular monolith for now. Package extraction is Step 11.1+ dependency work, not an immediate objective.

---

## Step 20 — Next Platform Architecture & Roadmap Realignment (THIS MILESTONE)

Steps 0–19 are immutable history. Step 20 is an architecture checkpoint: nothing here is implemented — every row below is future work.

### Historical milestone ledger (preserved — never renumber)

| Step | Scope | Dependency |
|---|---|---|
| 0–10 | Foundation | — |
| 11 | Package architecture plan (11.0/11.1) | after Step 10 |
| 15 | Trusted Record Actions & Lifecycle | Ledger foundation |
| 16 | Trusted Ledger & Audit | Step 12 server-record commands |
| 17 | Generic Notification capability | Step 15 command surface |
| 17.1 | Universal Form Ledger & Historical Form Viewer | Step 16 |
| 17.1.1 | Configurable Ledger Books & universal Ledger sources | Step 17.1 |
| 17.2 | Module categories & personal module organization | Steps 16–17.1.1 |
| 17.3 | Trusted Entity & Module Administration + Change History | Step 17.2 |
| 17.4 | Technical Identifier UX Hardening + small nav fixes | Step 17.3 |
| 18 | Workspace Chat & Contextual Conversations | Step 17.4 |
| 19 | Organization, Chat Rooms, Communication Context & UX Stability | Step 18 |
| **20** | **Next Platform Architecture, Roadmap Realignment & Development Continuity** | Step 19 |

### Foundational Platform

| Step | Requires | Provides | Unlocks |
|---|---|---|---|
| 21 — Capability Registry & Dependency Graph (GAP-014 close) | 20 | machine-readable capability metadata; agents/discovery fill the canonical catalog | 26, 27, 33 |
| 22 — Business Event Backbone contract | 20+21 | canonical BusinessEvent persisted structure plus emit surface | 23, 24, 25, 28, 33 |
| 23 — Rules / Decision Engine (minimal deterministic evaluation) | 22 | deterministic RuleDefinition evaluation over Events/State | 25, 28, 33 |
| 24 — Permission / Policy / Authority separation & Temporal Grants | 22 | auto/approval-required/deny outcomes; temporal validity windows; fallback policy | 23, 25, 30 |
| 25 — Configuration Lifecycle + Rollback (DRAFT → VALIDATE → TEST/SIMULATE → POLICY CHECK → PUBLISH → VERSIONED, revert-N) | 23+24 | shared publish pipeline for Rules/Agents/Connectors | all future config-bearing capabilities |
| 26 — Agent Orchestrator + Live Provider Adapters (GAP-014 Live) | 21+25 | planner/executor boundary, first Agent↔Agent handoff, provider-agnostic orchestration | specialized business Agents |
| 27 — Secrets/Credential Vault (bounded prototype for integration flows) | 20+24 | encrypted credential write-paths, rotation/expiry policies, no raw material to UI/agents | 28 and beyond |
| 28 — Platform Gateway: public REST + MCP + Webhooks for the trusted surface | 24+27 | securely scoped external access to canonical capabilities | WordPress/ERP/partner apps, agent tool bridging |

### Business capabilities

| Step | Requires | Provides | Unlocks |
|---|---|---|---|
| 29 — Files / Attachments (+photos/documents/img) | 17.3+24 | canonical File/Attachment storage and references | richer Module Page, Photos, PDF, media for Chat/Import |
| 30 — Approval / Position Cards | 23+24 | policy-driven approval packaging and listens | 31–33 with policy-based approval |
| 31 — Inventory (Product + Location identifiers, Inventory Transaction ledger) | 27+29 | stock state, movement ledger |  |
| 32 — Consumption / Recipe / BOM | 31 | BOM registry, deterministic consumption | automatic Procurement links under Stock script |
| 33 — Procurement (Supplier + Purchase Requirement + Purchase Order + policy approval; finalized Ledger entries on supplier receipt) | 30+31+32 | full procurement toolkit | restock operations |

### Integrated Experience

| Step | Requires | Provides | Unlocks |
|---|---|---|---|
| 34 — Tasks & Action Inbox (What needs my attention?) | 30+31+33 | canonical day-focused projection; approved actions + pending operations + notifications in one inbox | human-in-loop workflow capture |
| 35 — Module Page/View Composition (GAP-013 closure) | 21+25+29 | generic declarative view compositions (Lists/Table/Calendar/Chart…) | mobile Calendar and boards |
| 36 — Mobile Calendar view & Live Operational Board | 35 | view definitions for narrow/TV form factors, surface on canonical data | workplace display boards at Sites |

### Integration & Compliance

| Step | Requires | Provides | Unlocks |
|---|---|---|---|
| 37 — Data Import & Mapping Engine (real engine) | 25+28 | declarative mapping → canonical import with dry-run validation and provenance audit per import batch | drop-in modernization from station-tested formats |
| 38 — Data Portability (canonical export) | 28+37 | record/entity/account-authorized exports with provenance | GDPR-ready transitions, owner-allowed migration |

### Maturity — deferred-only list (intentionally NOT numbered)

- Global Search (GAP-003 picked up here)
- Units/Measurements/Currency concept (no Engine yet)
- i18n/timezone support
- Compliance / Regulatory rule packs + Verified statuses (never publicly strips encrypted data)
- Regulatory Monitoring Agent observation (observation only; no creation)
- Optional Blockchain ANCHOR of finalized Ledger blocks (proof only, never personal data on public chain)

Verified note — **Steps 0–20 are immutable history**. Changing Steps 21+ relative to earlier steps requires updating the dependency map among them; it never alters the history.

### Historical milestone ledger (preserved, do not renumber)

| Step | Scope | Dependency |
|---|---|---|
| 0–10 | Foundation | — |
| 11 | Package architecture plan (11.0/11.1) | after Step 10 |
| 15 | Trusted Record Actions & Lifecycle | Ledger foundation |
| 16 | Trusted Ledger & Audit | Step 12 server-record commands |
| 17 | Generic Notification capability | Step 15 command surface |
| 17.1 | Universal Form Ledger & Historical Form Viewer | Step 16 |
| 17.1.1 | Configurable Ledger Books & universal Ledger sources | Step 17.1 |
| 17.2 | Module categories & personal module organization | Steps 16–17.1.1 |
| 17.3 | Trusted Entity & Module Administration + Change History | Step 17.2 |
| 17.4 | Technical Identifier UX Hardening + small nav fixes | Step 17.3 |
| 18 | Workspace Chat & Contextual Conversations | Step 17.4 |
| 19 | Organization, Chat Rooms, Communication Context & UX Stability | Step 18 |
| **20** | **Next Platform Architecture, Roadmap Realignment & Development Continuity** | Step 19 |

### Step 21+ roadmap — dependency-driven (GROUPED by capability family)

Numbering reflects the DOCUMENTED order of expected implementation. Reordering is allowed ONLY when the dependency graph says so.

| Step | Name | Requires | Provides | Unlocks |
|---|---|---|---|---|
| 21 | **Capability Registry & Dependency Graph (GAP-014 close)** — canonical machine-readable capability metadata, registry bookkeeping, capability context inputs/outputs/permissions contract | 20 | Agents, search and future Engines can query/discover | 26, 27, 29 |
| 22 | **Business Event Backbone contract** — BusinessEvent, event persistence, standardized emission surface, idempotent correlation, first-class trace +店的 NOTIFICATION fan-out of deterministic events | 20+21 | canonical event surface replacing direct inter-engine calls | 23, 24, future Procurement/Inventory reactions |
| **23** | Rules / Decision Engine � VERIFIED: deterministic evaluator (src/core/rules) with DecisionResult + TransitionIntent; zero mutations; rules ? policy ? permission; supported closing intents `evaluate` based on canonical BusinessEvents | 22 | **Rules / Decision Engine (minimal deterministic evaluation)** — versioned RuleDefinition, deterministic evaluation over Events/State, recommended transition intents, cycle protection, dry-run mode | 22 | deterministic rules core | 25, 28, Data Import logical automations |
| **24** | **Permission / Policy / Authority separation & Temporal Grants � verified** | 22 | actor-typed policy construction is explicit from the current context; decision rules it to AUTO_EXECUTE / APPROVAL_REQUIRED / DENY on any non-overriding basis; rules.getAuthority granularity returns NULL will | 23 |
| 25 | **Configuration Lifecycle** — DRAFT → VALIDATE → TEST/SIMULATE → POLICY CHECK → (AUTO-PUBLISH / APPROVAL REQUIRED / DENY) → PUBLISHED, versioned, rollback to N-1 | 23+24 | versioned configuration ownership for Rule/Agent/Connector/etc. | all future Engines use a shared publish path |
| 26 | **Agent Orchestrator + Live Provider Adapters** — provider-agnostic planner/executor, deterministic adapter set (expandable to future LLM providers), structured agent↔agent handoffs, trace-backed observability finds | 21+25 | complete future Agents machinery without inventing Chat-petal Chat multiple identity | all practical use of Agents; "George Pizza"/"WindTech"-style specialized workspaces are enabled |
| 27 | **Integration Platform & Connectors** — canonical Connectors (WordPress > stories_shape > partners > ERP), sync jobs, credential mapping/storage primitives, inbound/outbound events bending into BusinessEvent sphere | 21+22+24.4 | canonical platform boundary; WordPress/websites/ERP/SAP surface flows without crossing | supplier integrations, OAuth/apps/MCP adapters, WordPress embedded client |
| 28 | **Platform Gateway + Developer Platform** — public REST+MCP for subset of trusted surface, scoped API tokens, webhook emitters, first third-party access surface to canonical capabilities | 21+25+27 | industry-grade gateway | external builders and entire agent/ERP/WordPress work |

### BUSINESS CAPABILITIES

| Step | Name | Requires | Provides |
|---|---|---|---|
| 29 | **Files / Attachments** — canonical File reference storage + UI; no local-storage canonical paths | 17.3+24 | entity/file attachments, future Sites & document surfaces |
| 30 | **Approval & Position Cards** — safe human-only shipping approvals supplied by Policy; approval cards feed the Action Inbox (E2E) | 23+24 | human approval on conditional smart Rules actions |
| 31 | **Inventory** — Product & Location dependencies, InventoryTransaction ledger, available-seat/reserved/current, minimal minimum targets | 20.2+21+29 | foundational inventory movement data | drives All المستخدمين ideas near BOM |
| 32 | **Consumption / Recipe / BOM** — versioned Product+Component catalog mapping; deterministic consumption reporting, minimal calculation | 21+31 | component-level data | procurement requirements, inventory-driven production |
| 33 | **Procurement** — Supplier, Purchase Requirement, Purchase Order with configurable approval policies and settled Ledger entries on supplier receipt | 30+31+32 | complete procurement order flow | on−demand replenishment/generation engines |
| 34 | **Tasks & Shared-UX Workflow base** — generic task records ON canonical assignment/note linking; “What needs my attention?” inbox becomes the first projection | 30+31 | Task references | future workflow-building without Task specific Engines |

### EXPERIENCE

| Step | Name | Requires | Provides |
|---|---|---|---|
| 35 | **Module Page/View Composition** (GAP-013 closure) — declarative view slots (List/Table/Chart/Calendar/etc.) with dragging+reordering | 21+25+29 | module-specific page composition | mobile Calendar, site-level broadcast boards |
| 36 | **Mobile Calendar / Live Operational Board** — exposing decl. view through the Mobile-side cases and Display mode | 35+close-Access L8 | TV/mobile live boards at site level | live boards, kiosks, job-site posters |
| 37 | **Action Inbox** ("What needs my attention?") — approved + tasks + alerts + notifications under one user inbox | 30+34 | obvious close interaction |

### INTEGRATION/CONTENT

| Step | Name | Requires | Provides |
|---|---|---|---|
| 38 | **Data Import & Mapping Engine (real Engine)** — deterministic mapping spec → canonical Record/Entity creation with dry-run validation and Media Provenance audit table on import | 21+25+28 | real no-code import | bulk onboarding, ERP/SAP archive transition |
| 39 | **Data Portability & Compliance groundwork** — export surfaces to Entities/Records/Files on human order policy-verified files; include relevant Provenance rows; the scope is export-only | 27+28 | reference exports | GDPR/data protection compliance ready for export flow |

### MATURITY (future gated)

> Planned only after the foundation depends has stabilized: Global Search (GAP-003); Units/Measurements/Currency; zone-i18n/timezone local few workflow/contexts; Compliance/Regulatory platform; Monitoring; Optional Blockchain ANCHOR ledger (never personal data on public chain; anchors proof only for integrity, not for legal burden)

Every milestone above the CONTEXT shape is informed of the health-check coverage table and the previous milestones closure. Do not re-number or re-order completed historical milestones.
**Single repository.** Keep Core, Engines, Agents, Features, Infrastructure, and Design System in one Git repository with explicit package boundaries. Do not split into per-engine repositories until there is concrete evidence that deployment scale or team autonomy requires it.
