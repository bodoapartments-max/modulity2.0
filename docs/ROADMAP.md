# Modulity 2.0 — Roadmap

This document lists the planned development milestones. Steps 1–9 are intentionally out of scope for Step 0.

---

## Step 0 — Architecture Blueprint & Project Constitution

**Status:** Complete

- Define architecture, boundaries, dependency direction
- Define data model, module contract, agent contract, event contract
- Define security, billing, design, performance and testing strategies
- Create minimal project scaffolding
- Do NOT implement application features
- Do NOT migrate Modulity V1

---

## Step 1 — Foundation

- Initialize project toolchain (Vite, React, Tailwind, ESLint, Prettier)
- Set up design-system tokens and base components
- Set up infrastructure abstractions (config, persistence adapter interfaces)
- Set up identity and authentication adapter
- Set up CI lint/test skeleton
- Hello-world app shell with routing placeholder

---

## Step 2 — Workspace & People

- User registration / login / profile
- Personal workspace
- Organization (workspace) creation and settings
- Membership invitations, roles, groups
- Basic permission system
- Organization switcher / context

---

## Step 3 — Universal Data Core

- Core Entity and Domain Entity definitions
- Entity instances (create, read, update, soft-delete)
- Relationship engine
- Assignment engine
- File attachments metadata
- Search foundation

---

## Step 4 — Module Engine

- Module registry
- Module manifest validation
- Module Runtime
- Schema-driven form renderer with reusable field components
- Module installation / activation per workspace
- Basic module builder UI

---

## Step 5 — Record & Collaboration Engine

- Canonical Record model
- Record creation from module forms
- Record lifecycle transitions
- Assignment and recipient model
- Sharing (user, member, group, email, secure link, QR)
- Record permissions and access control

---

## Step 6 — Ledger & Audit Engine

**Status:** Complete

- LedgerBook model — workspace-scoped numbered registers with configurable block size
- LedgerBlock model — physical-book blocks with automatic rollover
- LedgerEntry model — immutable registration linking Records to durable register identity
- Atomic sequence allocation via Firestore transactions
- Block rollover concurrency-safe
- Idempotent registration (same bookId + recordId = same entry)
- Human reference number format: `{PREFIX}-{YEAR}-{SEQ:6}`
- Deterministic ledger code uniqueness reservation
- Cancellation/voiding preserves sequence numbers permanently
- AuditEntry — append-only durable accountability history
- Audit Action Registry — 30+ controlled action names
- Audit Bridge — maps Event Bus events to durable audit persistence
- Module ledgerConfig — optional Ledger auto-registration configuration
- Record ↔ Ledger linkage — immutable reference fields on Record
- Firestore Security Rules — workspace isolation, immutability, append-only audit
- Ledger UI — book list, book detail, entry detail, book creation
- Record History UI — audit timeline on Record detail page
- 10 new composite indexes

## Step 6.1 — Ledger Consistency, Idempotency & Audit Hardening

**Status:** Complete

- **Transaction-level idempotency** — authoritative check inside the same `runTransaction` that allocates sequence numbers
- **Create-once LedgerEntry semantics** — existing entries never overwritten by retry, `_idempotent` flag distinguishes first-creation
- **Atomic Record↔Ledger linkage** — Record linkage updated inside the same Firestore transaction as LedgerEntry creation
- **Multiple-LedgerBook-per-Record policy** — explicit support; Record fields store first registration, `listByRecord()` returns all
- **Atomic LedgerBook bootstrap** — code reservation + book + block + currentBlockId in one `runTransaction`, no orphan code reservations
- **Audit ownership model** — LedgerService owns ledger audit, AuditBridge handles non-ledger events, no duplicate AuditEntries
- **Audit failure semantics** — documented best-effort; audit failure does not roll back business operations
- **Server-authoritative timestamps** — Firestore `serverTimestamp()` for all Ledger/Audit historical fields
- **Provenance validation in Rules** — LedgerEntry create requires Record and Book exist in same workspace, initial status must be ACTIVE
- **Emulator concurrency tests** — same-record (20 concurrent), distinct-record (50 concurrent), block rollover, sequence gap preservation
- **Client trust limitations documented** — sequence allocation, audit creation, provenance validation limitations are explicit

---

## Step 7.2 — Workspace Experience Closure

**Status:** Complete with explicit deferrals

- Workset edit/module/context flow closed
- Dashboard/Module/Record/Entity/Ledger integration audited
- Notification provenance and recipient behavior hardened
- Membership-protected Chat foundation and honest empty UI added
- Responsive header and Records navigation hardened
- Canonical cross-feature emulator journey added
- Deferred: Widget aggregation (Step 8), Chat creation/realtime collaboration extras, Entity cursor UI

## Step 7.1 — Workspace Runtime Hardening

**Status:** Complete

- Firestore development backend/API initialized and rules released
- Deterministic, concurrent-safe Personal Workspace bootstrap
- Core Workspace readiness separated from optional feature discovery
- Stale local Workspace fallback
- Independent Dashboard section loading
- Ledger loading/empty/error settlement
- Empty Personal Workspace emulator integration coverage

## Step 7 — Workspace Experience

**Status:** Complete

- Workspace-aware Dashboard with quick actions, Workset Modules, recent Records, and Widgets
- Workset model, persistence, active user preference, and management UI
- Controlled WidgetDefinition/query foundation and My Widgets UI
- Notification model/service, selective event mapping, unread header indicator, and Notification Center
- Runtime loading audit and explicit loading/ready/empty/error settlement
- Safe multi-workspace switching with active Workset restoration
- Grouped responsive sidebar, mobile drawer, responsive grids and forms
- Firestore Rules and emulator tests for all Step 7 collections
- Chat remains an architecture-compatible placeholder

---

## Step 8.1 — Safe Workspace Reset

**Status:** Implementation complete; deployment/browser closure pending Firebase Blaze upgrade

- Trusted callable/Admin SDK boundary and OWNER authorization
- Allowlisted current-Workspace data reset; User/Workspace/Organization/Memberships preserved
- Typed confirmation, plan/count preview, lock/idempotency, surviving metadata audit
- Emulator destructive/isolation/concurrency integration coverage
- Deferred: binary Storage cleanup adapter, write-epoch enforcement, realtime session invalidation, MODULE_DATA_RESET/FULL_WORKSPACE_DELETE

## Step 8 — Reports & Intelligence

**Status:** Complete — deterministic scope

- Canonical ReportDefinition and lifecycle
- Shared controlled query/filter/aggregation/grouping primitives
- Bounded module-aware and multi-Module Report execution
- Table, summary, and basic deterministic charts
- Existing WidgetDefinition execution: KPI, STATUS_SUMMARY, RECENT_RECORDS, TABLE, ASSIGNMENT
- Independent Dashboard Widget rendering/cache/error boundaries
- Rules/indexes, negative security tests, and canonical Emulator journeys
- Explicit limits and LIMIT_EXCEEDED behavior
- Agent Registry, specialist agents, and orchestrator deferred by explicit Step 8 scope decision; no AI execution is part of Step 8

---

## Step 9 — Automat System Builder

- Automation rule engine
- Trigger / action model
- Visual automation builder
- Integration webhooks
- External API tokens and service identities
- External agent support

---

## Notes

- Steps may be split or reordered based on validated learning.
- Each step must leave the codebase cleaner and the architecture intact.
- No V1 migration unless explicitly planned as a separate milestone.
