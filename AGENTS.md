# Modulity 2.0 — Agent Guide

This file contains practical guidance for anyone (human or coding agent) working on Modulity 2.0.

## Mandatory Governance

Before planning or modifying Modulity 2.0, read [`DEVELOPMENT_RULES.md`](DEVELOPMENT_RULES.md) and the authoritative architecture documents relevant to the task.

`DEVELOPMENT_RULES.md` contains mandatory cross-cutting engineering guardrails. If a requested implementation conflicts with those rules, report the conflict instead of silently violating the architecture.

## Project Type

React + Vite + Tailwind CSS application. JavaScript/JSX. Design tokens live in `src/design-system/tokens.js`.

## Quick Commands

```bash
npm install
npm run dev          # start dev server
npm run build        # production build
npm run lint         # ESLint
npm run test         # Vitest (unit/component tests)
npm run test:rules   # Firestore Security Rules tests (requires emulator)
npm run test:e2e     # Playwright (when tests exist)
```

## Where to Find Things

| Concern                   | Location                                       |
| ------------------------- | ---------------------------------------------- |
| Architecture decisions    | `docs/`                                        |
| App shell / routing       | `src/app/`                                     |
| Business logic subsystems | `src/core/`                                    |
| Workspace / People        | `src/core/workspace/`                          |
| Event bus                 | `src/core/events/`                             |
| Module engine             | `src/modules/`                                 |
| Agent layer               | `src/agents/`                                  |
| User-facing features      | `src/features/<feature>/ui/` + `model.js`      |
| Reusable UI               | `src/design-system/`                           |
| External integrations     | `src/integrations/`                            |
| Infrastructure adapters   | `src/infrastructure/`                          |
| Firestore repositories    | `src/infrastructure/firebase/firestore*.js`    |
| Service wiring            | `src/infrastructure/services.js`               |
| Repository wiring         | `src/infrastructure/repositories.js`           |
| Workspace context         | `src/app/providers/WorkspaceProvider.jsx`       |
| Tests                     | Next to source (`*.test.jsx`, `*.test.js`)     |

## Rules of Thumb

- The canonical object is a **Record**. Do not duplicate Records for different views.
- Core works without agents. Agents are optional and never bypass security.
- Dependencies point inward: `app` → `features`/`modules` → `core` → `infrastructure`.
- Never put business logic in presentational components.
- Never put permission decisions only in React conditional rendering.
- Always use design tokens; no hardcoded colors or spacing.
- Keep tests next to the code they test.
- Update `docs/` and `CHANGELOG.md` when structure or contracts change.
- Do not import code from Modulity V1 unless explicitly approved.

## Step 3 — Universal Data Core

Step 3 added the universal data layer under `src/core/data/`:

| File | Purpose |
|------|---------|
| `actorRef.js` | Typed actor identity (USER, INTERNAL_AGENT, EXTERNAL_INTEGRATION) |
| `entityType.js` | Entity Type model with schema/field definitions |
| `coreEntityTypes.js` | 8 platform Core Entity Types |
| `entity.js` | Entity instance model |
| `relationship.js` | Workspace-scoped relationship model |
| `record.js` | Canonical Record foundation |
| `file.js` | File/attachment metadata |
| `entityService.js` | Entity CRUD, validation, reference resolution |
| `entityTypeService.js` | Entity Type registry, seeding, management |
| `relationshipService.js` | Relationship creation with integrity |
| `recordService.js` | Record lifecycle, entity reference validation |
| `fileService.js` | File metadata registration |
| `fileStorageContract.js` | Provider-independent file storage interface |

Key concepts:
- **Entity != Record != Module**. Entities are persistent identities; Records are business events.
- **Entity Types** have two categories: CORE (platform) and DOMAIN (organization).
- **Core Entity Types** are seeded idempotently per workspace and protected from modification.
- **Domain Entity Types** are user-extensible with typed field schemas.
- **Relationships** are workspace-scoped, validated (no dangling references, no cross-workspace).
- **Records** support distinct actor roles (createdBy, submittedBy, future: assignedTo, etc.).
- **Files** store metadata in Firestore; binary data goes to Firebase Storage.
- **Reference Resolver** enforces workspace isolation — cross-workspace references denied.
- All data is under `workspaces/{workspaceId}/` subcollections with explicit Firestore Security Rules.
- See `docs/UNIVERSAL_DATA_CORE.md` for full architecture.

## Step 3.1 — Universal Data Integrity Hardening

Step 3.1 hardened validation, reference integrity, and actor security without changing product scope:

### Validation
- `validateEntityData()` now validates actual field types (text/number/date/boolean/select/entity-reference/file-reference).
- `validateFieldDefinition()` validates key format, type support, constraints consistency, select options.
- `validateFieldDefinitions()` rejects duplicate field keys across an Entity Type.
- `validateFieldValue()` provides per-field type-specific validation.
- Undeclared fields in Entity data are **rejected** (schema-governed unknown-field policy).
- Canonical date representation: ISO 8601 (YYYY-MM-DD or full datetime).

### Reference Integrity
- `validateEntityReference()` — canonical structural validator shared across services.
- Entity Reference resolution verifies `ref.entityTypeId == entity.entityTypeId` (type integrity).
- Record `entityReferences[]` stores canonical objects (source of truth).
- Record `entityReferenceIds[]` is a derived flat array for `array-contains` queries (index only).
- Entity creation requires Entity Type with `ACTIVE` status.

### Actor Security
- Firestore Rules enforce `createdBy.actorType == 'USER'` and `actorId == auth.uid` via `isValidClientActor()`.
- `INTERNAL_AGENT` and `EXTERNAL_INTEGRATION` rejected from all client writes.
- Actor fields immutable after creation.

### Revalidation
- Entity updates revalidate data against Entity Type schema.
- Record draft updates revalidate entityReferences, data, and attachments.

## Step 4 — Module Engine + Form Schema + Form Renderer

Step 4 added the deterministic Module runtime under `src/modules/`:

| File | Purpose |
|------|---------|
| `module.js` | Module Definition domain model, statuses, code validation |
| `moduleRepository.js` | Provider-independent repository contract |
| `moduleService.js` | Module CRUD, lifecycle, versioning, code uniqueness |
| `moduleSubmissionService.js` | Orchestrator: Module → validation → RecordService |
| `demoModules.js` | ROOM_INSPECTION and VEHICLE_INSPECTION demo schemas |
| `forms/formSchemaValidator.js` | Schema validation, form values validation, entity ref extraction |
| `forms/fieldRegistry.js` | Deterministic field type → React component mapping |
| `forms/FormRenderer.jsx` | Generic schema-driven Form Renderer |
| `forms/displayFormatter.js` | Canonical value → human display formatting |
| `forms/fields/*.jsx` | 12 field components + FieldWrapper + UnsupportedField |

Key concepts:
- **MODULE != FORM != RECORD != ENTITY**. A Module is a definition. A Form is a rendered interface. A Record is persisted data. An Entity is a persistent business object.
- **MODULE != MODULE VERSION**. The Module document is the current configurable definition. A Module Version is an immutable historical snapshot.
- **One field system**: `FIELD_TYPES` in `entityType.js` extended with form types (including `date-range` for inclusive From/Till date periods and `datetime-range` for timed intervals). `ENTITY_FIELD_TYPES` subset for Entity Type validation. Full set for Form Schema validation.
- **Date/period field semantics**: `date` = one calendar date; `date-range` = inclusive calendar-date period; `datetime` = one date+time; `datetime-range` = one timed interval. Use `datetime-range` only when start/end form one business interval, never to combine unrelated business timestamps.
- **ModuleSubmissionService** is the orchestrator: loads Module, validates status, validates form data, extracts entity references, delegates to RecordService with exact `moduleVersion`, creates exactly ONE canonical Record.
- **Module identity**: `moduleId` (immutable internal), `moduleCode` (stable human/developer-facing, unique per workspace, immutable after creation, atomically reserved via `moduleCodes/{code}`).
- **Module lifecycle**: DRAFT → ACTIVE → INACTIVE/ARCHIVED. DRAFT freely editable without version snapshots. First activation creates immutable Version 1 snapshot. ACTIVE schema changes create next immutable version. Archived preserved for historical Records.
- **Records store**: `moduleId`, `moduleVersion` (exact version used at creation, immutable), `recordType` (from `recordConfig`, immutable).
- **INVARIANT: A historical Record must always be interpretable using the exact Module Version that created it.**
- **Firestore Rules**: `workspaces/{workspaceId}/modules/{moduleId}` with full workspace isolation, actor validation, immutable field protection, archived module protection, delete denied. Version snapshots and code reservations are fully immutable.
- **UI**: ModulesPage, CreateModulePage (manual builder), ModuleDetailPage, EditModulePage, ModuleFormPage (submission), RecordDetailPage (renders using historical version schema).

## Step 4.1 — Module Version History & Record Provenance Hardening

Step 4.1 hardened Module versioning and Record provenance:

| File | Purpose |
|------|---------|
| `modules/moduleVersion.js` | Module Version Snapshot domain model |
| `modules/moduleVersion.test.js` | Version snapshot unit tests |

Key changes:
- **Record `moduleVersion`**: added to `record.js`, `recordService.js`, `moduleSubmissionService.js`. Positive integer, immutable after creation. Firestore Rules enforce immutability.
- **Module Version Snapshots**: `workspaces/{workspaceId}/modules/{moduleId}/versions/{version}`. Immutable after creation. Contains full schema for historical Record interpretation.
- **Atomic `moduleCode` reservation**: `workspaces/{workspaceId}/moduleCodes/{code}` via `writeBatch`. Codes are permanent — never reused, even after archiving.
- **Version creation lifecycle**: DRAFT edits create no snapshots. First activation creates Version 1. ACTIVE schema changes atomically create next version + update Module.
- **RecordDetailPage**: loads historical version schema via `record.moduleId` + `record.moduleVersion`. Falls back to current Module schema with warning if snapshot not found.
- **Firestore Rules**: version snapshots (no update, no delete), code reservations (no update, no delete), Record provenance fields (`moduleId`, `moduleVersion`, `recordType`) immutable on update.
- **Trust boundary**: Browser validation is UX. ModuleSubmissionService is deterministic business validation. Firestore Rules are storage authorization. Rules cannot reproduce arbitrary schema validation — documented as trusted-submission limitation.

## Step 5 — Record Operations & Collaboration Engine

Step 5 added six focused services for Record-level operations:

| Service | Location | Responsibility |
|---------|----------|---------------|
| `RecordQueryService` | `src/core/data/recordQueryService.js` | Paginated queries, bucket views (ALL, OWN, STARRED, SENT, RECEIVED, ARCHIVED) |
| `RecordOperationService` | `src/core/data/recordOperationService.js` | Priority, archive/unarchive, bulk ops |
| `RecordDeliveryService` | `src/core/data/recordDeliveryService.js` | Record sharing/sending, delivery lifecycle |
| `RecordFolderService` | `src/core/data/recordFolderService.js` | Folders, folder items, starred state |
| `FormRequestService` | `src/core/data/formRequestService.js` | Form request creation, atomic completion |
| `SecureShareService` | `src/core/data/secureShareService.js` | Token generation/hashing, redemption |

New domain models: `recordQuery.js`, `delivery.js`, `formRequest.js`, `folder.js`, `userRecordState.js`, `secureShare.js`.

## Step 5.1 — Transaction, Idempotency & Concurrency Hardening

Step 5.1 hardened atomicity and concurrency before Step 6 Ledger/Audit:

| Invariant | How |
|-----------|-----|
| ONE FormRequest = ONE Record | Deterministic ID `req_{requestId}` + Firestore `runTransaction` |
| Exact Module Version | `getVersionSnapshot()` not current Module |
| Submitted data immutable | Firestore Rules freeze `data`/`entityReferences`/`entityReferenceIds` after DRAFT |
| Share redemption safe | Firestore `runTransaction` for atomic count check+increment |
| Recipients validated | Active membership check for org workspaces, owner check for personal |
| Pagination stable | `documentId()` tie-breaker ordering |
| `sourceRequestId` | Immutable Record ↔ FormRequest link |
| Archive provenance | `archivedAt` + `archivedBy` for future Ledger |

**Trusted submission limitation:** Completion runs as client-side Firestore transaction. Firestore Rules provide defense-in-depth (immutability, workspace isolation, actor validation) but cannot reproduce arbitrary schema validation. Full trusted-submission enforcement deferred to Cloud Function (Step 6+).

## Step 6 — Ledger & Audit Engine

### New Domain Models
| Model | Path | Purpose |
|---|---|---|
| LedgerBook | `src/core/ledger/ledgerBook.js` | Numbered register with code, blocks, reference prefix |
| LedgerBlock | `src/core/ledger/ledgerBlock.js` | Physical-book block with capacity and rollover |
| LedgerEntry | `src/core/ledger/ledgerEntry.js` | Immutable registration linking Record to Ledger identity |
| AuditEntry | `src/core/audit/auditEntry.js` | Append-only accountability record |
| AuditActions | `src/core/audit/auditActions.js` | Controlled action vocabulary and resource types |

### Services
| Service | Path | Purpose |
|---|---|---|
| LedgerService | `src/core/ledger/ledgerService.js` | Book management, atomic registration, cancellation |
| LedgerQueryService | `src/core/ledger/ledgerQueryService.js` | Paginated Ledger queries |
| AuditService | `src/core/audit/auditService.js` | Durable audit READ models + queries (browser read-only) |
| (removed) AuditBridge | — | Step 16: retired — browsers no longer write Audit evidence |

### Repositories
| Repository | Path |
|---|---|
| LedgerBookRepo | `src/infrastructure/firebase/firestoreLedgerBookRepository.js` |
| LedgerEntryRepo | `src/infrastructure/firebase/firestoreLedgerEntryRepository.js` |
| AuditEntryRepo | `src/infrastructure/firebase/firestoreAuditEntryRepository.js` |
| LedgerCodeRepo | `src/infrastructure/firebase/firestoreLedgerCodeRepository.js` |

### Step 6 Invariants
1. Ledger Entry never replaces or copies the canonical Record
2. A Ledger number, once allocated, is never reused
3. Concurrent registration can never create duplicate sequence numbers
4. One Record may appear at most once in the same Ledger Book
5. Cancelled or voided entries remain permanently visible
6. Ledger numbering is server/transaction authoritative
7. Audit history is append-only
8. Audit is not the same thing as the runtime Event Bus
9. Record, Ledger, and Audit remain three distinct layers
10. Clients cannot claim trusted agent/integration identities

### Quick Commands
- `npm run lint` — ESLint
- `npm run test` — Vitest (545+ tests)
- `npm run test:rules` — Firestore emulator security + concurrency tests (241+ tests)
- `npm run build` — Vite production build

## Step 6.1 — Ledger Consistency, Idempotency & Audit Hardening

### Critical Fix: Transaction-Level Idempotency
The idempotency check is now **inside** `registerRecordAtomic()`, within the same Firestore `runTransaction` that allocates the sequence number. The outer `getByBookAndRecord()` is an optimization only.

### Hardened Invariants (Step 6.1)
1. Same Record + same LedgerBook can consume only ONE sequence number
2. Idempotency check exists inside the same transaction that allocates the sequence
3. Existing LedgerEntry is never overwritten by retry
4. Concurrent distinct registrations produce unique, contiguous sequences
5. Block rollover never creates duplicate blocks
6. Record↔Ledger linkage is atomic with entry creation (same transaction)
7. LedgerBook bootstrap is atomic (code + book + block, no orphan reservations)
8. Authoritative historical time comes from Firestore server timestamps
9. Audit ownership prevents duplicate durable events (LedgerService vs AuditBridge)
10. Documentation does not claim stronger trust guarantees than implementation provides

### Audit Ownership Model
| Owner | Actions |
|---|---|
| Trusted server functions (recordCommand / ledgerCommand) | record.* lifecycle events, ledger.book_created, ledger.entry_registered |
| (retired in Step 16) browser AuditBridge | was: record.*, delivery.*, formRequest.* — browser-authored delivery/FormRequest lifecycle events currently have NO durable Audit rows until they gain trusted commands |

### Trusted-Boundary Limitations
- Sequence allocation is concurrency-safe for honest clients but not tamper-resistant without a trusted backend
- Audit writes are best-effort; audit failure does not roll back business operations
- Firestore Rules validate Record/Book existence but cannot validate allocation logic
- Step 16 (ADR-0008): Ledger/Audit authoring is now server-only (`ledgerCommand`, transaction-committed audit); Rules deny browser ledger/audit writes and Record linkage writes.
- Step 17 (ADR-0009): generic Notification capability — canonical contract, trusted server engine, deterministic dedupe, IN_APP delivery; browsers can only toggle their own read state.
- Step 17.1 (ADR-0010): Universal Form Ledger — trusted `SUBMIT_RECORD`/`CREATE_RECORD` auto-registers into a per-Module Form Book; trusted `CANCEL_RECORD` crosses out entries (never deletes); read-only Historical Form Viewer with Prev/Next; reset contract also wipes `recordOperations`.
- Step 17.1.1 (ADR-0011): Configurable Ledger Books — evidence ≠ organization. `sourceDefinition` (typed, closed union, MODULE v1) + `provisionedBy` on books; USER-configured register wins over the AUTO fallback; trusted deterministic backfill organizes historical evidence; only trusted commands create/modify authoritative Ledger state.
- Step 17.2 (ADR-0012): Module Categories & Personal Selection — canonical `moduleCategories` shared by manual and Automat paths; `Module.categoryId` link; personal selection/order/viewMode on `userWorkspacePreferences.moduleSelection` validated against real Modules; auto technical code generation (`core/utils/technicalCode.js`); All Modules navigator discovers authorized-hidden Modules; Rule: categories ≠ authorization ≠ personal visibility.
- Step 17.3 (ADR-0013): Trusted Entity & Module Administration — typed `adminCommand` engine with dependency-gated hard delete + durable before/after Audit; CONTACT Core Entity Type; Rule: protected configuration mutation is server-only.

## Step 2 Architecture Notes

- **Workspace** is the central operating context. All future modules/records operate within a workspace.
- **User != Person != Membership != Employee != Role** — see `docs/WORKSPACE_MODEL.md`.
- **Services** are React-independent: `core/workspace/*Service.js`. They can be consumed by web, mobile, agents, or API.
- **Repositories** follow a contract pattern: `core/workspace/*Repository.js` (contract) → `infrastructure/firebase/firestore*.js` (implementation).
- **WorkspaceProvider** initializes personal workspace + profile on first login, loads accessible workspaces, handles switching.
- **Events** use the bus at `core/events/eventBus.js`. Services emit events for audit/tracking.
- **Firestore Security Rules** are in `firestore.rules`. Application-layer checks complement them.

## Step 2.1 Security Architecture

- **Memberships** are subcollections at `organizations/{orgId}/members/{userId}` — deterministic path for Security Rules lookups.
- **Groups and Invitations** are also subcollections under `organizations/{orgId}/`.
- **User membership index** at `userMemberships/{userId}/orgs/{orgId}` enables "get my orgs" queries.
- **Organization creation** uses atomic `writeBatch()` — org + workspace + membership + index in one commit.
- **Security Rules** enforce organization isolation, role-based access, field immutability, and deny-by-default independently of app code.
- **Security Rules tests** are in `tests/rules/` and run against the Firebase Emulator Suite.

### Adding New Workspace-Scoped Collections

**NO NEW WORKSPACE-SCOPED FIRESTORE COLLECTION MAY BE ADDED WITHOUT EXPLICIT SECURITY RULES AND CROSS-WORKSPACE NEGATIVE TESTS.**

1. Place as subcollection under `workspaces/{workspaceId}/` or `organizations/{orgId}/`
2. Add read rules requiring workspace ownership or `isActiveMember(orgId)`
3. Add appropriate write rules with immutable field protection
4. Add cross-workspace and cross-org negative tests in `tests/rules/`
5. Document in `docs/SECURITY_MODEL.md`

## Step 10.3 — Generic Module & Form Designer

- User-created forms are canonical declarative FormSchemas, never generated per-form JSX/components.
- Human Designer, Automat, future Photo/PDF import, and trusted APIs converge into the same ModuleDefinition/FormSchema contracts.
- Designer is an authoring surface, not FormRenderer, Module Engine, Record Engine, Entity store, or Capability Engine.
- Preview must use production FormRenderer and must never create a Record.
- Existing ModuleService/version lifecycle is authoritative: DRAFT edits are mutable, first activation creates v1, ACTIVE schema publication creates the next immutable snapshot.
- Historical Records must remain readable through their immutable `moduleId + moduleVersion`.
- EntityReference fields use current-Workspace canonical Core/Domain Entity Types; no paths or duplicate reference systems.
- Reject executable configuration, scripts, expressions, arbitrary Firestore paths, unsupported fields, invalid options/listFields, and unbounded schemas.
- Designer does not grant authorization. Existing Personal-owner and Organization ADMIN/OWNER Module Rules remain authoritative.
- Capability configuration remains independent CapabilityDefinitions; never embed arbitrary capability execution inside Module schemas.
- Do not create business-specific form/list/detail components when FormRenderer and generic Record runtime suffice.
- Future importers produce proposed schemas for human Designer review; they do not generate JSX or publish directly.

## Step 10.2 — Composable Capability Engines

- Entity ≠ Module ≠ Record ≠ Capability Engine. Engine ≠ Definition ≠ Binding ≠ View.
- Capability Engines compose around canonical data; never create capability-specific duplicate business stores.
- Capability Definitions are versioned declarative configuration and cannot contain executable code, arbitrary expressions, raw queries, Firestore paths, remote scripts, JSX, `eval`, or functions.
- Prefer independent Workspace-scoped Definitions referencing typed canonical sources over embedding whole engine configuration in ModuleDefinition.
- No Engine may bypass canonical services, Workspace authorization, permission, entitlement, or Audit requirements.
- Read/projection capability output is derived/rebuildable. Optional Engine failure must not corrupt canonical business state.
- Future action engines require trusted command execution, authorization, idempotency, journaling, failure isolation, and Audit.
- Availability and entitlement are separate. Never label `ARCHITECTURE_ONLY` as operational.
- New Engines require stable IDs, versioned descriptors/Definitions, bounded configuration, deterministic generic + engine-specific validation, and dependency-cycle review.
- No browser-loaded executable plugins or arbitrary remote code. External extensions use future versioned APIs/events/commands through trusted boundaries.
- Automat may read the code-free catalog and propose non-operational requirements; it never becomes capability execution authority.
- Step 10.2 adds no CapabilityDefinition persistence and no Calendar runtime/UI/querying/event store.

## Step 10.4 — Calendar & Scheduling Engine Foundation

- Calendar is the first operational Capability Engine. It is a derived read/projection over canonical Records.
- CapabilityDefinitions are persisted generically in `workspaces/{workspaceId}/capabilityDefinitions/{definitionId}`.
- CalendarDefinitions map title, start, optional end, and optional resource fields from a Module's `FormSchema`. Field choices are constrained. A single `date-range` or `datetime-range` field can supply both start and end for its respective period semantics.
- The Calendar Engine queries canonical Records within a bounded window, maps them to rebuildable `CalendarEventProjection`s, and resolves EntityReference labels through the canonical Entity service.
- Calendar View supports Month, Week, and Day; event click opens canonical Record Detail.
- Multiple CalendarDefinitions can coexist; combined views retain record/module/definition identity.
- No Calendar-specific business-data collection is created (no `calendarEvents`, `reservationEvents`, etc.).
- CapabilityDefinition management requires Personal Workspace owner or Organization OWNER/ADMIN; MEMBER is denied.
- Firestore Rules enforce workspace scope, immutable identity/provenance, bounded safe configuration, and lifecycle transitions.
- Workspace Reset removes CapabilityDefinitions; identity, membership, core entity types, and audit evidence are preserved.
- Automat Workspace Architect sees Calendar as `AVAILABLE`; trusted apply for CapabilityDefinitions remains deferred to Designer handoff or a future approved write group.

## Step 10.1 — Automat Workspace Architect

- Workspace evolution uses the existing Agent Registry, adapters, AutomatBuildPlan, deterministic validator, persistence, approval, fingerprint, and trusted apply pipeline.
- `WorkspaceSemanticModel` is bounded in-memory planning data over configuration metadata; it is never canonical storage.
- Apply reuse-before-create and thing-versus-process: persistent identity → Entity Type; recurring event/transaction → Module + Record.
- Prefer Core Entity Types for staff, vendors, clients, cars, tools, locations, documents, and people when semantically compatible.
- Semantic reasoning provides evidence only. Deterministic schema/reference classification authorizes REUSE or CONFLICT.
- Store concise decision rationale, never hidden chain-of-thought.
- Clarification and `ANALYSIS_INCOMPLETE` stop before persistence/approval.
- Never propose DELETE, replacement, arbitrary SAFE_UPDATE, operational Entity/Record creation, scripts/JSX, Calendar copies, or RelationshipDefinition.
- Configuration text is untrusted data. Agent output cannot select Firestore paths, authorization, entitlement, or apply authority.

## Step 12 — Trusted Record Submission & Server Authority

- Canonical business Record creation from user-facing clients must cross a trusted server-authoritative command boundary.
- Client-side validation is UX, not authority.
- The Record command contract is versioned (`RECORD_COMMAND_CONTRACT_VERSION = "1.0.0"`) and extensible; Step 12 implements only `CREATE_RECORD`.
- The server derives actor identity from verified Firebase Auth, not from client payload.
- The server resolves Workspace membership, Module existence/status/version, FormSchema, and EntityReferences from canonical Workspace data.
- Only `ACTIVE` Modules may receive canonical Records; `DRAFT` Modules are rejected.
- Server-authoritative metadata (`createdAt`, `updatedAt`, `createdBy`, `recordId`, `moduleVersion`) is generated/overridden by the trusted executor.
- Record submission is idempotent per `operationId`; the same `operationId` returns the same canonical Record on retry, while a different command with the same `operationId` is rejected.
- Stale `PROCESSING` operations are recovered by inspecting canonical state and bounded server-side leases, not by client clocks.
- Direct browser `CREATE` on `workspaces/{workspaceId}/records/{recordId}` is denied; canonical creation flows through the `recordCommand` callable.
- Capability Engines and Agents may request commands later but may not bypass authorization or deterministic validation.
- Stable refs and fingerprint/stale-plan behavior remain mandatory; repeat requests must converge on REUSE.

## Step 10.0 — Generic Entity Management

- Entity Type is a schema/registry definition; Entity is one persistent object; Module is a process; Record is canonical activity. Never collapse them.
- Core Entity Type definitions remain protected. Core and Domain Entity instances use the same generic list/create/edit/detail runtime.
- Operational route: `/app/entities` → Entity Type list → bounded Entity list → Entity detail. Entity Type registry remains at `/app/entity-types`.
- Lists require explicit Workspace + entityTypeId, `displayName`/document-ID stable pagination, max 100, configured indexes, and no whole-Workspace filtering.
- Generic columns derive from schema; EntityReference labels use batched canonical Entity reads.
- Entity create/edit uses FormRenderer and EntityService; no Employee/Room-specific components or artificial CRUD Modules.
- Physical Entity delete remains forbidden; use ACTIVE/INACTIVE/ARCHIVED.
- Automat-created Domain Entity Types must work immediately without frontend changes.

## Step 9.2 — Trusted Automat Apply

- Browser/Agents never apply canonical configuration; only `automatPlan` and `automatApplyPlan` trusted callables may persist/approve/apply.
- Approval binds the immutable server plan fingerprint and planning configuration fingerprint. Current configuration is re-fingerprinted before apply.
- Apply supports CREATE/REUSE only. SAFE_UPDATE is disabled; CONFLICT blocks; REPLACE_DELETE is forbidden.
- Type-level relationship proposals are optional UNSUPPORTED recommendations and are never written to the instance Relationship collection.
- Application order: Entity Types → ACTIVE Modules + Version 1/code reservation → Worksets → Widgets → Reports → verification.
- Apply is phase-journaled and resumable, not globally atomic. Never add destructive rollback.
- Plans are client-readable/trusted-write-only. Operations, locks, and external audits remain Admin-only.
- Functions use allowlisted copied canonical pure validators generated by `functions/scripts/build-shared.mjs`; do not hand-edit generated files.
- Workspace Reset removes plans/generated configuration and lock state while preserving apply operation/audit evidence.
- See ADR-0002 and `docs/AUTOMAT_ARCHITECTURE.md`.

## Step 9.0 — Agent Infrastructure & Automat Contracts

- Agent code lives in `src/agents/`; it is optional, React-independent, and has no canonical persistence path.
- Agents propose structured versioned output; `buildPlanValidator.js` deterministically validates/classifies it.
- BuildPlan operations are CREATE/REUSE/SAFE_UPDATE/CONFLICT/UNSUPPORTED. Never add REPLACE_DELETE.
- Use the implemented shared Entity/Module/Form/Widget/Report validators; do not create a parallel schema language.
- WorkspaceConfigurationSnapshot is bounded configuration metadata only—never hydrate Records, Entities, Ledger, Messages, or Notifications for planning.
- Step 9.0 persists neither AgentExecutionResult nor AutomatBuildPlan. New persistence requires Rules, negative isolation tests, and a trusted lifecycle decision.
- Step 9.1 uses six registered specialist Agents and deterministic structured knowledge; Core validation remains industry-neutral.
- `/app/automat` is lazy-loaded, review-only, and must never expose a functional Apply operation.
- Planning accepts only the current authenticated Workspace, loads bounded configuration summaries, and verifies a before/after snapshot fingerprint.
- BuildPlans remain in memory. Live AI providers and Step 9.2 approval/application are not started.
- See `docs/AUTOMAT_ARCHITECTURE.md`.

## Step 8.1 — Workspace Reset

- Workspace Reset is implemented only through the trusted Firebase callable/Admin SDK boundary.
- Never add browser delete loops or client delete permissions for immutable Workspace resources.
- Reset allowlist: `functions/src/workspaceResetContract.js`.
- Semantics and limitations: `docs/WORKSPACE_RESET.md`.
- Reset integration tests require the Firestore Emulator and functions dependencies.

## Step 8 — Reports & Intelligence

- Shared analytics primitives: `src/core/analytics/`.
- Persist ReportDefinition/WidgetDefinition only; ReportResult/WidgetResult are runtime projections.
- Maximums: 5 source Modules, 500 source Records, 100 rows/groups, 10 filters, 8 metrics, 12 columns, 100 Widget records.
- Unsafe paths/operators/metrics are rejected at model/service and Rules boundaries.
- Multi-Module plans use bounded `moduleId in [...]` queries; never scan an entire Workspace.
- Dashboard Widgets execute independently and must not fail the Dashboard.
- AI/agents and Step 9 Automat are explicitly deferred.

## Step 7.2 — Closure Invariants

- Worksets reference canonical Module IDs and affect presentation only.
- WidgetDefinitions remain configuration; aggregation/visualization belongs to Step 8.
- Notifications reference canonical resources and require attributable creator provenance.
- Conversation `memberIds` supports list queries; ConversationMember documents authorize Message access.
- Messages are append-only, server-timestamped, and queried in bounded pages.
- Do not describe Chat conversation creation, realtime listeners, attachments, read receipts, or Widget analytics as complete.
- Responsive header controls must remain reachable at 375px; wide Record tabs/tables use controlled horizontal scrolling.

## Step 7.1 — Runtime Bootstrap Rules

- Core readiness depends only on Auth and a valid Personal Workspace.
- Never make Workspace availability depend on Worksets, preferences, Widgets, Notifications, Dashboard projections, or Ledger.
- Personal Workspace ID is deterministic: `personal_{userId}`.
- A missing deterministic Workspace/preference document must be readable as missing under Firestore Rules so bootstrap can create it.
- Stale `modulity_lastWorkspaceId` must fall back to Personal Workspace.
- Every workspace-scoped loader must settle early-return, success, empty, and error branches.
- Security tests use a one-shot emulator; do not point a long-running dev app at an emulator that the test command will stop.
- Workspace query cache keys must include workspaceId, resource, and normalized query/page parameters.
- Cached data is presentation optimization only; Firestore remains canonical.
- Preserve cached content during `REFRESHING`; use full loading UI only for `INITIAL_LOADING`.
- Small bounded metadata may be idle-prefetched. Never prefetch full Records, Entities, Ledger Entries, Notifications, or Audit collections.
- Mutations must invalidate or update the matching workspace/resource cache prefix.

## Step 7 — Workspace Experience

- **Workset is context, not authorization.** It references canonical `moduleIds`; Module access remains governed by workspace membership and permissions.
- **Widget is configuration, not data.** Renderers query canonical Records/Relationships through controlled, bounded query definitions.
- **Notification != Event != Audit.** The notification bridge selectively maps user-facing events; it does not mirror every event.
- User-specific workspace state lives at `workspaces/{workspaceId}/userWorkspacePreferences/{userId}`.
- Every workspace loader must settle into loading, ready, empty, or error. Early returns must clear loading.
- Workspace changes must clear stale arrays and key requests by active `workspaceId`.
- Step 7 collections: `worksets`, `widgetDefinitions`, `notifications`, `userWorkspacePreferences`.

## Migration Note

This is a clean rebuild. Modulity V1 is only a reference and must not be copied.
