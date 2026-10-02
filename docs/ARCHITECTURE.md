# Modulity 2.0 — Architecture Overview

This document describes the high-level structure, subsystem boundaries, and dependency direction of Modulity 2.0.

---

## 1. High-Level Layers

```
┌─────────────────────────────────────────────┐
│  app/                                       │
│  Shell, routing, auth context, entry point   │
└──────────────┬──────────────────────────────┘
               │ uses
┌──────────────▼──────────────────────────────┐
│  features/                                  │
│  listview, folders, sharing, widgets, ...   │
│  Each feature: ui/ + model.js               │
└──────────────┬──────────────────────────────┘
               │ uses
┌──────────────▼──────────────────────────────┐
│  modules/                                   │
│  contracts, registry, runtime, forms, views │
└──────────────┬──────────────────────────────┘
               │ uses
┌──────────────▼──────────────────────────────┐
│  core/                                      │
│  identity, workspace, membership, entities, │
│  records, relationships, permissions,       │
│  assignments, ledger, events, files,       │
│  entitlements                               │
└──────────────┬──────────────────────────────┘
               │ uses
┌──────────────▼──────────────────────────────┐
│  integrations/                              │
│  api, webhooks, billing adapters            │
└──────────────┬──────────────────────────────┘
               │ uses
┌──────────────▼──────────────────────────────┐
│  infrastructure/                            │
│  firebase, persistence, config                │
└─────────────────────────────────────────────┘

Cross-cutting: design-system/ (used by app, features, modules)
```

---

## 2. Dependency Direction

- **Dependencies point inward.**
- `app/` depends on `features/`, `modules/`, `design-system/`, `infrastructure/`.
- `features/` depend on `modules/` and `core/`.
- `modules/` depend on `core/` contracts.
- `core/` depends only on `infrastructure/` abstractions, never on features or modules.
- `integrations/` expose Core capabilities to the outside world.
- `design-system/` has no business logic and depends on nothing.

A lower layer never imports from a higher layer. Circular dependencies are forbidden.

---

## 3. Subsystem Responsibilities

### Core

| Subsystem       | Responsibility                                                                |
| --------------- | ----------------------------------------------------------------------------- |
| `identity`      | User accounts, authentication, user profiles, service identities              |
| `workspace`     | Organizations / workspaces, creation, branding, settings                      |
| `membership`    | User ↔ Organization membership, roles, groups, status                         |
| `entities`      | Core entity definitions and instances (Employee, Vehicle, Room, etc.)         |
| `records`       | Canonical Record creation, reading, updating, lifecycle transitions           |
| `relationships` | Links between Records and Entities / Domain Entities                          |
| `permissions`   | Centralized authorization: roles, permissions, module access, entitlements    |
| `assignments`   | Who is assigned to a Record, Entity or task                                   |
| `ledger`        | Durable historical registration, ledger books, sequences, numbered form books |
| `events`        | Event bus, event contracts, event persistence                                 |
| `files`         | File upload, storage metadata, attachments                                    |
| `entitlements`  | Capability checks derived from plans / subscriptions                          |

### Step 5 — Record Operations & Collaboration Engine

The Record Operations layer is organized into focused, independently testable services:

| Service | Responsibility |
|---------|---------------|
| RecordQueryService | Paginated queries, filtering, sorting, bucket views (ALL, OWN, STARRED, SENT, RECEIVED, ARCHIVED) |
| RecordOperationService | Priority changes, archive/unarchive, bulk operations, submitted-data immutability |
| RecordDeliveryService | Record sharing/sending, delivery lifecycle, sent/received views |
| RecordFolderService | Folders, folder items, starred state (user record state) |
| FormRequestService | Form request creation with locked Module Version, lifecycle, atomic completion |
| SecureShareService | QR/link foundation, token generation/hashing, redemption |

**Central Invariant:** ONE BUSINESS SUBMISSION = ONE CANONICAL RECORD. Everything else is a view, relationship, delivery, assignment, organization mechanism, or projection around that Record.

### Step 5.1 — Transaction, Idempotency & Concurrency Hardening

Hardening applied before Step 6 Ledger/Audit can depend on these services:

| Invariant | Implementation |
|-----------|---------------|
| ONE FormRequest = AT MOST ONE Record | Deterministic Record ID (`req_{requestId}`) + Firestore `runTransaction` for atomic completion |
| Completion uses exact locked Module Version | `getVersionSnapshot(moduleId, moduleVersion)` loads immutable snapshot, not current Module |
| Submitted business data is immutable | Firestore Rules: `data`, `entityReferences`, `entityReferenceIds` frozen after DRAFT status |
| Share token redemption concurrency-safe | Firestore `runTransaction` for atomic redemption count check + increment |
| Recipients must be active members | Application-layer membership validation for deliveries and form requests |
| Pagination is stable | Explicit `documentId()` tie-breaker ordering prevents duplicates/skips |
| sourceRequestId links Record to FormRequest | Immutable provenance field on Record (null for normal, requestId for completed requests) |
| Archive has provenance | `archivedAt` (server timestamp) + `archivedBy` (ActorRef) for Ledger |
| SENT/RECEIVED/STARRED are real queries | Two-step bounded resolution via collaboration collections, not UI labels over ALL |

### Modules

| Subsystem   | Responsibility                                                      |
| ----------- | ------------------------------------------------------------------- |
| `contracts` | Versioned Module Contract definitions                               |
| `registry`  | Registration and discovery of modules in a workspace                |
| `runtime`   | Module execution: form rendering, lifecycle transitions, validation |
| `forms`     | Schema-driven form field components and renderer                    |
| `views`     | ListView, TableView, DetailView, LedgerView projections             |

### Agents

| Subsystem      | Responsibility                                                       |
| -------------- | -------------------------------------------------------------------- |
| `contracts`    | Agent contract definitions (input/output, capabilities, validation)  |
| `registry`     | Discover and register agents                                         |
| `orchestrator` | Coordinate specialist agents without giving them direct state access |
| `providers`    | Adapters for LLM/provider APIs                                       |

### Features

| Subsystem       | Responsibility                                               |
| --------------- | ------------------------------------------------------------ |
| `listview`      | Reusable Record List Engine                                  |
| `folders`       | User and workspace folders for organizing Records            |
| `favorites`     | Personal lightweight favorites                               |
| `sharing`       | Share Records/forms via user, member, group, email, link, QR |
| `notifications` | Notification delivery based on events                        |
| `chat`          | User/group/organization messaging                            |
| `widgets`       | Configuration-driven dashboard widgets                       |
| `reports`       | Configuration-driven multi-module reports                    |
| `worksets`      | Module packs / context-aware toolsets                        |

### Integrations

| Subsystem  | Responsibility                                  |
| ---------- | ----------------------------------------------- |
| `api`      | External API surface for agents and partners    |
| `webhooks` | Outbound event delivery                         |
| `billing`  | Billing provider adapters and subscription sync |

### Infrastructure

| Subsystem     | Responsibility                                                   |
| ------------- | ---------------------------------------------------------------- |
| `firebase`    | Firebase-specific adapters (auth, Firestore, Storage, Functions) |
| `persistence` | Persistence abstractions and query helpers                       |
| `config`      | Environment-based configuration                                  |

### Design System

Reusable, tokenized UI primitives. No business logic. Used by all higher layers.

---

## 4. Communication Between Subsystems

- **Synchronous, in-process** calls use typed functions with explicit contracts.
- **Asynchronous, decoupled** communication uses the `events` subsystem with versioned event envelopes.
- **External** communication uses the `integrations/api` surface.

No subsystem may reach into another subsystem's internal implementation. Use the documented contract.

---

## 5. Replaceability

Every subsystem with an external dependency must expose an interface/contract so the implementation can be swapped:

- Auth provider adapter in `identity`
- Persistence adapter in `persistence`
- File storage adapter in `files`
- Billing provider adapter in `integrations/billing`
- Agent provider adapter in `agents/providers`

Changing a provider must never require rewriting Core business logic.

---

## 6. Canonical Data Projections

The same Record data is presented in multiple ways:

- Form View
- List View
- Table View
- Detail View
- Ledger View
- Widget
- Report

These are read-only projections of the canonical Record. No view owns the Record. No view duplicates authoritative fields.

---

## 7. Event-Driven Foundation

Core subsystems emit events such as:

- `record.created`
- `record.sent`
- `record.viewed`
- `record.submitted`
- `entity.created`
- `assignment.changed`
- `ledger.book.closed`

Consumers (notifications, widgets, reports, agents, future automation) react to the same events. The Core does not depend on consumers.

A full workflow engine is intentionally out of scope for Step 0.

---

## 8. Universal Data Core (Step 3)

Step 3 established the universal data layer under `core/data/`:

| Component | Location | Purpose |
|-----------|----------|---------|
| `actorRef.js` | `core/data/` | Typed actor identity (USER, INTERNAL_AGENT, EXTERNAL_INTEGRATION) |
| `entityType.js` | `core/data/` | Entity Type model with schema/field definitions |
| `coreEntityTypes.js` | `core/data/` | 8 platform Core Entity Types (PERSON, EMPLOYEE, etc.) |
| `entity.js` | `core/data/` | Entity instance model with lifecycle |
| `relationship.js` | `core/data/` | Workspace-scoped relationship model |
| `record.js` | `core/data/` | Canonical Record foundation |
| `file.js` | `core/data/` | File/attachment metadata |
| `entityService.js` | `core/data/` | Entity CRUD, validation, reference resolution |
| `entityTypeService.js` | `core/data/` | Entity Type registry, seeding, management |
| `relationshipService.js` | `core/data/` | Relationship creation with integrity validation |
| `recordService.js` | `core/data/` | Record creation, lifecycle, entity reference validation |
| `fileService.js` | `core/data/` | File metadata registration |
| `fileStorageContract.js` | `core/data/` | Provider-independent file storage interface |

Firestore adapters in `infrastructure/firebase/`:
- `firestoreEntityTypeRepository.js`
- `firestoreEntityRepository.js`
- `firestoreRelationshipRepository.js`
- `firestoreRecordRepository.js`
- `firestoreFileRepository.js`
- `firestoreModuleRepository.js`

All data is workspace-scoped under `workspaces/{workspaceId}/` subcollections.

See `docs/UNIVERSAL_DATA_CORE.md` for detailed architecture.

---

## 8b. Module Engine (Step 4)

The Module Engine provides a deterministic runtime for schema-driven form rendering and Record creation.

**Key principle:** `MODULE != FORM != RECORD != ENTITY`

| File | Location | Purpose |
|------|----------|---------|
| `module.js` | `modules/` | Module Definition domain model, statuses, code validation |
| `moduleRepository.js` | `modules/` | Provider-independent Module repository contract |
| `moduleService.js` | `modules/` | Module CRUD, lifecycle, versioning, code uniqueness |
| `moduleSubmissionService.js` | `modules/` | Orchestrator: Module → validation → RecordService |
| `demoModules.js` | `modules/` | ROOM_INSPECTION and VEHICLE_INSPECTION demo schemas |
| `formSchemaValidator.js` | `modules/forms/` | Schema validation, form values validation, entity ref extraction |
| `fieldRegistry.js` | `modules/forms/` | Deterministic field type → React component mapping |
| `FormRenderer.jsx` | `modules/forms/` | Generic schema-driven Form Renderer |
| `displayFormatter.js` | `modules/forms/` | Canonical value → human display formatting |
| `fields/*.jsx` | `modules/forms/fields/` | 12 field components + FieldWrapper + UnsupportedField |

**Shared field system:** `FIELD_TYPES` in `core/data/entityType.js` is extended with form-oriented types (textarea, email, phone, url, datetime). Entity Type validation uses the `ENTITY_FIELD_TYPES` subset. Form Schema validation uses the full set.

**Runtime flow:**
```
Module Definition → Form Schema → FormRenderer → User Input → validateFormValues()
→ extractEntityReferences() → ModuleSubmissionService → RecordService → Canonical Record
```

**Module storage:** `workspaces/{workspaceId}/modules/{moduleId}`

## 8c. Module Version History & Record Provenance (Step 4.1)

**Key invariant:** A historical Record must always be interpretable using the exact Module Version that created it.

| File | Location | Purpose |
|------|----------|---------|
| `moduleVersion.js` | `modules/` | Module Version Snapshot domain model |
| `moduleVersion.test.js` | `modules/` | Version snapshot unit tests |

**Immutable version snapshots:** `workspaces/{workspaceId}/modules/{moduleId}/versions/{version}`

Each snapshot preserves the complete historical schema (`formSchema`, `recordConfig`, `displayConfig`, `primaryEntityTypeId`, identity, actor) at the time of version creation. Snapshots cannot be updated or deleted.

**Atomic `moduleCode` reservation:** `workspaces/{workspaceId}/moduleCodes/{code}`

Module creation atomically reserves the code via `writeBatch`. Codes are permanent — never reused, even after archiving. Reservations cannot be updated or deleted.

**Version creation lifecycle:**
```
DRAFT → freely editable, no version snapshots
  ↓ first activation
ACTIVE v1 + immutable Version 1 snapshot
  ↓ schema change
ACTIVE v2 + immutable Version 2 snapshot (Version 1 unchanged)
```

**Record provenance:** Every Module-created Record stores `moduleId`, `moduleVersion`, `recordType` as immutable fields. These three fields plus `workspaceId` form the authoritative historical interpretation key.

**Historical rendering:** RecordDetailPage loads the Module Version snapshot via `record.moduleId` + `record.moduleVersion`, not the current Module schema.

**Atomicity:** Version snapshot creation + Module update use `writeBatch`. Module creation + code reservation use `writeBatch`. The consistency boundary is documented: `writeBatch` ensures both writes succeed or both fail.

**Trust boundary:**
- Browser form validation = UX
- ModuleSubmissionService = deterministic business validation
- Firestore Rules = storage authorization boundary
- Firestore Rules cannot reproduce arbitrary Module Form Schema validation
- A malicious client with direct Firestore access could create semantically invalid `Record.data` unless final submission moves behind a trusted backend

See `docs/MODULE_CONTRACT.md` for the authoritative Module contract.

---

## 9. Performance Strategy

- Route-level lazy loading in `app/`.
- Module-level lazy loading for module runtime components.
- Server-side / query filtering for lists and tables.
- Pagination and cursor-based infinite scroll.
- Limited real-time subscriptions scoped to the current view.
- Indexed queries for common filters.
- Optimistic UI only where safe and rollback is possible.
- No loading of entire organization datasets on startup.

---

## Step 8 — Reports & Intelligence Engine

```text
Canonical Records / Entities / Relationships
→ validated Definition
→ bounded QueryPlan
→ deterministic filter/sort/projection
→ shared aggregation/grouping
→ ReportResult / WidgetResult
→ presentation renderer
```

ReportDefinition and WidgetDefinition persist configuration only. Runtime results are regenerated from canonical data and are not canonical snapshots.

Shared primitives live outside React and enforce: allowlisted sources/fields/operators/metrics/visualizations; typed comparisons; UTC relative periods; maximum 5 source Modules, 500 source Records, 100 rendered rows, 100 groups, 10 filters, 8 metrics, and 12 columns. Source-bound overflow throws `LIMIT_EXCEEDED`; row truncation is explicit in output/UI.

Multi-Module Reports use a bounded Firestore `moduleId in [...]` plan, preserving each Record's `moduleId` and `moduleVersion`. Fields absent in historical versions resolve to null and are excluded from numeric aggregation. EntityReference labels use batched Entity lookups rather than per-row requests.

The existing WidgetDefinition is extended and executed through the same analytics service. Each Dashboard Widget has an independent SWR cache/loading/error boundary. ASSIGNMENT uses canonical Relationships; no parallel assignment store exists.

Report routes are lazy-loaded. Basic BAR/LINE/DONUT presentation uses deterministic lightweight rendering without executable/custom chart code or a new chart dependency.

Step 8 deliberately excludes AI generation, arbitrary query paths, executable formulas, exports, scheduling, durable result snapshots, and Step 9 Automat. Agent registry/orchestrator items formerly listed in Step 8 ROADMAP were explicitly deferred by architecture decision for this milestone.

## Step 7.2 — Workspace Experience Closure

### Feature status
- Dashboard: integrated with canonical Workspace, Modules, Records, Worksets, and WidgetDefinitions; advanced Widget metrics deferred to Step 8.
- Worksets: create/edit/archive/activate, canonical Module references, active-context filtering, and All Modules escape. Worksets never authorize access.
- Widgets: real owner-scoped definition persistence and Dashboard presence; aggregation/visualization engine deferred.
- Notifications: real recipient-scoped persistence, read state, action links, bounded query, attributable browser creator, and selective Event mapping.
- Chat: safe deterministic foundation for DIRECT/GROUP Conversations, immutable Members, append-only Messages, bounded history, and existing-conversation UI. Conversation/member creation UI and collaboration extras are deferred.
- Records, Entities, and Ledger remain canonical engines consumed by the Workspace Experience.

### Chat boundary

```text
Conversation (workspace, immutable memberIds)
  └─ ConversationMember/{userId} (access authority)
      └─ Message (append-only, sender provenance, server timestamp)
```

Conversation list queries use immutable `memberIds` for query authorization. Reading/sending Messages additionally requires the authenticated user's ConversationMember document. History is descending and limited to 50 per request (30 in UI).

### Integration journey
The emulator journey verifies one workspace can reference a canonical Module from a Workset and WidgetDefinition, create a canonical Entity and Module-driven Record, deliver a resource-referencing Notification, persist active Workset preference, and exchange a bounded Chat Message without duplicating business data.

## Step 7.1 — Workspace Query Cache

V1 performance review found that fast navigation came from a persistent shell, in-memory provider state, static Module registries, localStorage business-data duplication, and page-specific Firestore listeners. V2 retains the persistent-shell/render-from-memory behavior but rejects duplicated local business data and overlapping listeners.

V2 uses an in-memory, workspace-scoped stale-while-revalidate cache:

```text
workspaceId : resource : normalized query/filter/page
```

Cache states are `IDLE`, `INITIAL_LOADING`, `READY`, `REFRESHING`, and `ERROR`. Cached content remains visible during refresh. Entries have bounded freshness windows and are never persisted as a second business-data source of truth.

Small resources (`modules`, `worksets`, user Widgets) are prefetched after Workspace readiness during browser idle time. Entity Types are fetched/seeded on first use. Large resources remain bounded: Records cache a filtered first page (25), Entities are capped at 100 pending cursor pagination, Dashboard Records are capped at 5, and Ledger caches only Ledger Books—not Ledger Entries. Notifications and Audit remain bounded query-driven views.

Mutations invalidate resource prefixes for the active workspace. Workspace IDs are part of every key, so switching A→B cannot render A data as B. Prior B cache may be reused when switching back if still fresh.

Observed development behavior after Firestore initialization:
- First Personal Workspace creation: ~2.8s (one-time read + create)
- Steady-state cold reload: ~2s
- First uncached route: brief network flash, typically ~1–2s
- Cached repeat Modules/Ledger navigation: perceived immediate, no full skeleton
- Empty Ledger first visit: ~1–2s; repeat visit immediate

## Step 7.1 — Runtime Startup Dependency Graph

Required startup path:

```text
AuthProvider → authenticated User → deterministic Personal Workspace get/create → currentWorkspace READY
```

Optional paths begin only after the Personal Workspace is usable:

```text
Person profile
Organization membership/workspace discovery
Worksets + active Workset preference
Dashboard Module/Record/Widget projections
Notifications
Ledger
```

Optional failures use feature/experience error state and never clear a valid `currentWorkspace`. Dashboard projections load independently; no optional section blocks the Workspace shell. The last Workspace ID is validated by direct lookup, removed if stale/inaccessible, and replaced with the Personal Workspace.

Personal Workspace identity is deterministic (`personal_{userId}`), making concurrent first-login bootstrap converge on one document. A diagnostic rejection boundary identifies backend operations that fail to settle; it is failure handling, not normal startup control flow.

The October 2026 runtime incident was caused by the `modulity-2-dev` project having no enabled Firestore API/default database. Firestore SDK operations retried for 23–35 seconds and surfaced an offline error. The default database was created and rules deployed; steady-state Workspace startup then settled in approximately two seconds, with Dashboard sections completing independently.

## Step 7 — Workspace Experience

### Workspace Orchestration
The Dashboard, Worksets, Widgets, and Notifications are projections/orchestration over canonical Workspace, Module, Record, Relationship, and Ledger data. They do not duplicate those objects.

### Worksets
A Workset is a workspace-scoped list of canonical Module IDs used to adapt navigation and the Dashboard. It never grants permission. Active Workset is stored per user and workspace in `userWorkspacePreferences`, allowing the same user to maintain different contexts across Personal and Organization Workspaces. Favorites remain an independent personal frequency signal.

### Widgets
WidgetDefinition is validated configuration interpreted by trusted renderers. Sources, fields, operators, and limits are allow-listed. Widget documents do not contain Record or Entity copies. Dashboard placement is stored separately in user workspace preferences.

### Notifications
Notification is actionable user-facing information, distinct from transient Event Bus events and append-only AuditEntries. A selective bridge maps `record.sent` to a recipient-scoped Notification. Delivery is best-effort until a durable backend dispatcher exists.

### Workspace Switching
WorkspaceProvider verifies target accessibility and membership before committing a switch. Workspace-scoped effects depend on `workspaceId`, cancel stale async results, clear old arrays, and reload active Workset preferences. Invalid targets fail without exposing previous-workspace data.

### Async State Policy
Every loader must settle into LOADING, READY, EMPTY, or ERROR. Empty data is not loading. Missing workspace/service dependencies settle to unavailable/empty; query failures expose a user-safe ErrorState with optional retry.

## Step 6 — Ledger & Audit Engine

### Three-Layer Separation
```
Record (canonical business object)
   ↓ references
LedgerEntry (durable register identity)
   ↓ records
AuditEntry (append-only accountability)
```

### Ledger Architecture
- **LedgerBook**: workspace-scoped numbered register with configurable block size
- **LedgerBlock**: physical-book pages, auto-rollover when full
- **LedgerEntry**: immutable registration with sequence number and human reference
- Atomic sequence allocation via Firestore `runTransaction`
- Idempotent registration: `(bookId, recordId)` → at most one entry
- Deterministic code reservation: `workspaces/{wsId}/ledgerCodes/{code}`
- Reference format: `{PREFIX}-{YEAR}-{SEQ:6}` (v1)

### Audit Architecture
- **AuditEntry**: append-only durable record, distinct from Event Bus
- **Audit Bridge**: subscribes to Event Bus, maps events to audit actions
- Controlled action registry with 30+ stable names
- Server-authoritative timestamps (`serverTimestamp()`)
- ActorRef validation: clients can only claim `USER` + own UID

### Module Integration
- Optional `ledgerConfig` on Module and Module Version
- `registerOnSubmit: true` enables auto-registration on submission (not yet wired)
- Ledger logic isolated in LedgerService, not in RecordService

## Step 6.1 — Ledger Consistency, Idempotency & Audit Hardening

### Transaction-Level Idempotency
- The authoritative idempotency check is **inside** `registerRecordAtomic()`, within the same Firestore `runTransaction` that allocates the sequence number.
- Flow: derive deterministic `entryRef` → `transaction.get(entryRef)` → if exists, return existing entry without allocating → only if absent, allocate sequence and create entry.
- The outer `getByBookAndRecord()` is an optimization only; it is NOT the correctness boundary.
- Existing LedgerEntries are **never overwritten** by retry — `_idempotent: true` flag distinguishes first-creation from idempotent return.

### Atomic Record↔Ledger Linkage
- Record linkage (`ledgerEntryId`, `ledgerBookId`, `referenceNumber`) is updated inside the **same Firestore transaction** that creates the LedgerEntry.
- If the Record already has linkage to the same entry, it is left unchanged (idempotent).
- If the Record has conflicting linkage (different entry), the record update is skipped and the entry is still returned.

### Multiple-LedgerBook-per-Record Policy
- A Record may participate in **multiple** LedgerBooks. Each `(bookId, recordId)` pair is unique.
- Record model retains singular `ledgerEntryId`/`ledgerBookId`/`referenceNumber` for the **first** registration. These are convenience fields; the authoritative linkage is the LedgerEntry collection.
- `ledgerEntryRepo.listByRecord()` returns all entries for a given Record across all books.

### Atomic LedgerBook Bootstrap
- `bootstrapBookAtomic()` creates the LedgerCode reservation, LedgerBook, initial LedgerBlock, and `currentBlockId` in a **single** Firestore `runTransaction`.
- If any step fails, nothing is created. No orphan code reservations possible.
- The code reservation is checked inside the transaction — concurrent duplicate creates are rejected.

### Audit Ownership
- **LedgerService** owns durable audit writes for all ledger operations (creation, registration, cancellation, voiding, closing).
- **AuditBridge** maps non-ledger Event Bus events (record, delivery, formRequest) to durable audit entries.
- Ledger events are **intentionally excluded** from AuditBridge to prevent duplicate AuditEntries.
- If audit persistence fails after a successful ledger operation, the ledger operation is **not rolled back**. This is a documented best-effort limitation for audit.

### Server Timestamp Authority
- All Ledger operations use Firestore `serverTimestamp()` for authoritative historical time.
- Fields: `_registeredAt`, `_createdAt`, `_updatedAt`, `_openedAt`, `_closedAt`, `_timestamp`.
- ISO string fields in domain models are non-authoritative display values derived client-side.
- Audit query ordering uses server-authoritative `_timestamp`, not client ISO strings.

### Firestore Rules Provenance Validation
- LedgerEntry create now requires: referenced Record exists in same workspace, referenced LedgerBook exists in same workspace, initial `entryStatus` must be `ACTIVE`.
- LedgerEntry immutability: 15 fields protected against mutation on update.
- LedgerCode reservation: create-only, no update, no delete.

### Trusted-Boundary Limitations
1. **Audit entries are created client-side.** Rules enforce `actorType: 'USER'` and `actorId == auth.uid`, but a sophisticated client could create audit entries with arbitrary action/resource combinations. Full trusted audit requires a Cloud Function.
2. **Sequence allocation runs as client transaction.** Firestore transactions provide atomicity, but a malicious client could construct custom writes. Rules protect immutability post-creation but cannot validate allocation logic itself.
3. **Provenance validation is limited to existence checks.** Rules verify Record and Book exist but cannot validate moduleId/version match or Record eligibility within security rules alone.
4. **No rate limiting.** Firestore Rules cannot enforce rate limits on creation.
5. **Auto-registration not wired.** `registerOnSubmit` config exists but the automatic trigger is deferred until the consistency boundary is safe for production use.
