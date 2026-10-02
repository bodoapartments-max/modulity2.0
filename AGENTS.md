# Modulity 2.0 — Agent Guide

This file contains practical guidance for anyone (human or coding agent) working on Modulity 2.0.

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
- **One field system**: `FIELD_TYPES` in `entityType.js` extended with form types. `ENTITY_FIELD_TYPES` subset for Entity Type validation. Full set for Form Schema validation.
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
| AuditService | `src/core/audit/auditService.js` | Durable audit recording and queries |
| AuditBridge | `src/core/audit/auditBridge.js` | Event Bus → Audit persistence mapping |

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
| LedgerService (direct) | ledger.book_created, ledger.entry_registered, ledger.entry_cancelled, ledger.entry_voided, ledger.book_closed |
| AuditBridge (Event Bus) | record.*, delivery.*, formRequest.* |

Ledger events are **excluded** from AuditBridge to prevent duplicates.

### Trusted-Boundary Limitations
- Sequence allocation is concurrency-safe for honest clients but not tamper-resistant without a trusted backend
- Audit writes are best-effort; audit failure does not roll back business operations
- Firestore Rules validate Record/Book existence but cannot validate allocation logic
- Full trusted audit/ledger requires Cloud Function (future)

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
