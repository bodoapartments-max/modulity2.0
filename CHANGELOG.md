# Changelog

All notable changes to Modulity 2.0 will be documented in this file.

## Step 9.0 — Agent Infrastructure & Automat Contracts

### Added
- Provider-independent AgentDefinition/Execution contracts, versioned Agent Registry, entitlement boundary, deterministic test adapter, and timeout/error-normalizing Orchestrator
- Declarative AutomatBuildPlan, stable temporary plan references, explicit lifecycle/provenance, and bounded WorkspaceConfigurationSnapshot
- Deterministic BuildPlan validation reusing Entity Type, Module, Form, Widget, and Report validators
- CREATE/REUSE/CONFLICT classification without destructive replacement
- Strict Organization Analyzer input/output contract for Step 9.1 without implementing analysis
- Generic hotel, existing Workspace REUSE, invalid plan, malformed provider, timeout, bounds, and provenance fixtures/tests
- `docs/AUTOMAT_ARCHITECTURE.md` and aligned Agent/Architecture/Data/Security/Roadmap contracts

### Scope
- Domain-only: no AgentExecution/BuildPlan persistence, Firestore collection, provider secret, external AI, canonical mutation, React planning logic, Step 9.1 intelligence, or Step 9.2 apply service
- Older automation rule/webhook/API-token/external-agent roadmap items explicitly deferred

## Step 8.1 — Safe Workspace Reset

### Added
- Minimal trusted Firebase callable/Admin SDK boundary for WORKSPACE_DATA_RESET
- Deterministic allowlisted ResetPlan with estimated counts and preserved-resource contract
- Personal owner and Organization OWNER authorization
- Admin-only per-Workspace operation lock, idempotent request IDs, minimal surviving reset audit, and reset generation metadata
- Typed Workspace-name confirmation Danger Zone for Personal and Organization Settings
- Workspace-scoped cache invalidation and clean app reload after success
- Emulator integration for Personal/Organization reset, member denial, multi-Workspace isolation, idempotency, concurrency, empty reset, analytics/Chat/Ledger nested cleanup, and post-reset reuse

### Deployment status
- CLOSED — DEPLOYMENT VERIFIED on `modulity-2-dev`
- `workspaceReset` v2 callable deployed to `europe-west1` on Node.js 22; Artifact Registry cleanup set to 30 days
- Authenticated disposable Organization reset, immediate Module/Record reuse, second reset, Personal Workspace isolation, audit/lock settlement, and 375px/768px confirmation smoke passed
- Browser verification found and fixed the new-Organization stale switch race and normalized `userId` Module detail/edit mismatch

### Limitations
- File metadata is deleted; binary storage cleanup adapter is not yet implemented
- Reset lock prevents concurrent resets but normal writes do not yet enforce dataGeneration/write epoch
- Firebase Functions dependency tree has a transitive moderate uuid advisory without a currently compatible non-breaking remediation

## Step 8 — Reports & Intelligence Engine

### Added
- Canonical workspace-scoped ReportDefinition persistence, lifecycle/versioning, builder, preview, run, edit, archive, table/summary/basic chart rendering
- Shared deterministic analytics primitives for typed field references, filters, UTC periods, sorting, grouping, COUNT/COUNT_DISTINCT/SUM/AVERAGE/MIN/MAX
- Controlled query planner with allowlisted RECORDS/ENTITIES/RELATIONSHIPS sources, maximum 5 source Modules, 500 source Records, 100 rows/groups, and explicit LIMIT_EXCEEDED behavior
- Multi-Module Report execution preserving Record Module/version provenance and missing historical fields as null
- Existing WidgetDefinition extended—not replaced—with executable KPI, STATUS_SUMMARY, RECENT_RECORDS, TABLE, and canonical Relationship ASSIGNMENT Widgets
- Independent Dashboard Widget execution/error/loading/cache boundaries
- Batched EntityReference display resolution and bounded Relationship reads
- ReportDefinition/Widget Rules hardening, indexes, negative security tests, unit/UI tests, and real Emulator analytics journey

### Scope decision
- Per explicit Step 8 approval, ROADMAP agent registry/orchestrator items are deferred; Step 8 remains deterministic and fully operational without AI
- AI Report/Widget generation, scheduling, exports, trusted server analytics, and Step 9 Automat are not implemented

## Step 7.2 — Workspace Experience Closure & Integration Audit

### Added
- Membership-protected Chat foundation: Conversation, ConversationMember, Message, bounded queries, server timestamps, service/repository, `/app/chat`, and responsive header control
- Workset edit flow for name, description, Module membership, zero-module state, archived/unavailable Module handling, and active Workset filtering on My Modules
- Real emulator journey connecting canonical Module → Workset → preference → Entity → Record → Widget → Notification → Conversation/Message
- Negative Chat security tests for non-members, sender spoofing, cross-workspace provenance, and immutable Messages

### Hardened
- Notification creation now requires attributable USER/self `createdBy`; provenance is immutable
- Notification Center uses workspace cache and updates the header unread count after mark-read
- Conversation metadata query uses immutable `memberIds`; Message access requires canonical ConversationMember documents
- Mobile header keeps Workspace, Notifications, Chat, and account actions reachable; Records tabs use controlled horizontal scrolling

### Actual deferred scope
- Widget metric/aggregation rendering remains Step 8; Step 7 stores and displays deterministic definitions only
- Chat conversation/member creation UI, typing, attachments, read receipts, and realtime delivery remain a later collaboration milestone
- Full cursor pagination for Entities remains follow-up; current read is bounded to 100

## Step 7.1 — Workspace Runtime Bootstrap Hardening

### Fixed
- Enabled and initialized the missing `(default)` Firestore database for `modulity-2-dev`; the absent backend caused 23–35 second SDK offline fallbacks
- Deterministic Personal Workspace IDs (`personal_{userId}`) make first-user bootstrap idempotent under concurrency
- Workspace startup now renders a valid Personal Workspace before optional Organization/workspace-experience discovery completes
- Optional Workset/preference errors no longer poison the core Workspace availability state
- Stale/inaccessible local Workspace selections are removed and replaced with the Personal Workspace
- Auth observer errors now settle AuthProvider instead of leaving authentication loading indefinitely
- Ledger and all workspace pages now settle missing workspace, empty query, and query failure states explicitly
- Dashboard Modules, Records, and Widgets load independently instead of a blocking `Promise.all` waterfall
- Missing user Workspace Preference documents can be read safely before first creation

### Performance
- Added a lightweight workspace-keyed stale-while-revalidate query cache without third-party state dependencies
- Cached Modules, Worksets, Widgets, Entity Types, bounded Entities, Ledger Books, Dashboard projections, and filtered Records first pages
- Added low-priority idle prefetch for bounded Modules and user Worksets/Widgets
- Distinguished initial loading from background refreshing so cached content remains visible
- Added mutation invalidation for Modules, Records, Worksets, Widgets, Entities, Entity Types, and Ledger Books
- Bounded Entity list reads to 100 pending full cursor pagination

### Validation
- Empty Personal Workspace emulator integration covers concurrent bootstrap and settled empty queries for Modules, Records, Entities, Entity Types, Worksets, Widgets, Notifications, Preferences, and Ledger
- Development startup operations have a diagnostic failure boundary; no Workspace bootstrap await can remain pending indefinitely
- Cache tests cover workspace isolation, deterministic keys, concurrent request deduplication, stale refresh, and targeted invalidation
- Real browser verification: ~2s steady-state reload; first uncached routes briefly load; repeat Modules/Ledger navigation renders immediately

## Step 7 — Workspace Experience

### Added
- Workspace-aware Dashboard with quick actions, active Workset Modules, recent Records, and Widget area
- Workset model/service/repository and user-specific active Workset preferences
- Workset list, creation, detail, activation, and archive UI
- Configuration-only WidgetDefinition model with controlled sources, fields, operators, and bounded limits
- My Widgets UI and responsive dashboard grid
- Notification model/service/repository, selective `record.sent` notification bridge, header unread count, and Notification Center
- Workspace Experience Firestore Rules and indexes for Worksets, Widgets, Notifications, and preferences
- Responsive grouped sidebar navigation and active Workset header selector

### Fixed
- Workspace and page loaders now settle when workspace/services are unavailable
- Entity Types, Entities, Modules, and Records no longer leave loading active when no workspace or zero data is available
- Workspace switching validates accessibility, loads membership before committing the switch, clears stale workspace views, and reports errors

### Architecture
- Workset is navigation context, never authorization
- Widget definitions store query configuration, never copied business data
- Event, Audit, and Notification remain distinct
- Loading, empty, ready, and error states are separate

## Step 6.1 — Ledger Consistency, Idempotency & Audit Hardening

### Fixed
- **Transaction-level idempotency** — authoritative idempotency check moved inside the same Firestore `runTransaction` that allocates sequence numbers. The outer `getByBookAndRecord()` is now an optimization only, not the correctness boundary.
- **Create-once LedgerEntry semantics** — existing entries are never overwritten by retry. Uses `_idempotent` flag to distinguish first-creation from idempotent return.
- **Atomic Record↔Ledger linkage** — Record `ledgerEntryId`/`ledgerBookId`/`referenceNumber` updated inside the same transaction that creates the LedgerEntry.
- **Atomic LedgerBook bootstrap** — code reservation + book + initial block + `currentBlockId` in a single `runTransaction`. No orphan code reservations on failure.
- **Audit duplication prevention** — LedgerService owns durable audit for ledger operations; AuditBridge handles non-ledger events only. Ledger events excluded from bridge mapping.
- **Server-authoritative timestamps** — all Ledger/Audit operations use Firestore `serverTimestamp()` for authoritative historical time. Client ISO strings are display-only.

### Added
- **Provenance validation in Firestore Rules** — LedgerEntry create requires: referenced Record exists in same workspace, referenced LedgerBook exists in same workspace, initial `entryStatus` must be `ACTIVE`
- **Multiple-LedgerBook-per-Record policy** — explicit support; `ledgerEntryRepo.listByRecord()` returns entries across all books
- **Emulator concurrency integration tests** — 20 concurrent same-record registrations (1 entry, 1 sequence consumed), 50 concurrent distinct records (50 unique contiguous sequences), block rollover under concurrency, cancelled number gap preservation
- **Provenance security tests** — nonexistent Record/Book rejected, non-ACTIVE initial status rejected
- **Audit ownership model** — documented: each audit action has exactly one owner (service or bridge)
- **Audit failure semantics** — documented: best-effort, audit failure does not roll back business operations

### Architecture
- Idempotency check is inside the transaction that allocates the sequence
- Record linkage is atomic with LedgerEntry creation
- LedgerBook bootstrap is atomic (code + book + block + currentBlockId)
- Audit is best-effort — not guaranteed permanent unless moved behind Cloud Function
- Sequence allocation is concurrency-safe for honest clients but not tamper-resistant without trusted backend

## Step 6 — Ledger & Audit Engine

### Added
- **LedgerBook** — numbered register model with workspace-scoped code uniqueness, configurable block size (25–10000), reference prefix, module/recordType scoping
- **LedgerBlock** — physical-book block model with automatic rollover when capacity reached
- **LedgerEntry** — immutable registration record linking canonical Records to Ledger identity with unique sequence numbers and human-readable reference numbers
- **AuditEntry** — append-only durable accountability history, distinct from runtime Event Bus
- **Audit Action Registry** — controlled vocabulary of 30+ stable action names across records, modules, entities, deliveries, form requests, ledger, and secure shares
- **Audit Bridge** — maps selected Event Bus runtime events to durable AuditEntry persistence
- **Ledger Service** — atomic sequence allocation, idempotent registration, cancellation/voiding, book lifecycle management
- **Ledger Query Service** — paginated, filtered Ledger Entry queries with stable ordering
- **Audit Service** — durable audit recording, resource/actor/general history queries
- **Module ledgerConfig** — optional Ledger configuration on Module and Module Version (enabled, ledgerBookId, registerOnSubmit)
- **Record ↔ Ledger linkage** — immutable `ledgerEntryId`, `ledgerBookId`, `referenceNumber` fields on Record
- **Ledger UI** — book list, book detail with paginated entries, entry detail, book creation form
- **Record History UI** — audit timeline on Record detail page showing chronological accountability trail
- **Firestore Security Rules** — Ledger Books, Blocks, Entries, Codes, Audit Entries with workspace isolation, immutability enforcement, append-only audit, actor validation
- **Composite indexes** — 10 new Firestore indexes for Ledger and Audit queries

### Architecture
- Ledger Entry never replaces or copies the canonical Record
- Sequence numbers allocated atomically via Firestore transactions
- Block rollover is concurrency-safe
- Registration is idempotent (same bookId + recordId = same entry)
- Cancelled/voided entries retain their sequence number permanently
- Audit is append-only and separate from the runtime Event Bus
- Server-authoritative timestamps for all historical operations
- Clients cannot claim trusted agent/integration identities in audit

## [Step 5.1] — Transaction, Idempotency & Concurrency Hardening

### Fixed
- **FormRequest Atomic Completion** — Completion now uses a Firestore `runTransaction` to atomically create the Record AND mark the request COMPLETED. Previously these were separate writes that could leave orphan duplicates on network failure.
- **FormRequest Idempotency** — Deterministic Record ID (`req_{requestId}`) ensures at most ONE Record per FormRequest. Retrying a completed request returns the existing result instead of creating a duplicate.
- **Exact Module Version Validation** — Completion now loads the immutable Module Version SNAPSHOT (`getVersionSnapshot`) instead of the current Module document. If request locks v2 but Module is now v5, validation and recordType provenance use v2.
- **SecureShare Redemption Concurrency** — Token redemption uses a Firestore `runTransaction` for atomic check-and-increment of redemptionCount. Two concurrent redemptions against maxRedemptions=1 result in exactly one success.
- **Submitted Record Data Immutability** — Firestore Rules now enforce that `data`, `entityReferences`, and `entityReferenceIds` are immutable on SUBMITTED/ACTIVE/COMPLETED/CANCELLED/ARCHIVED records. DRAFT records remain freely editable.
- **ARCHIVED Query Normalization** — ARCHIVED bucket now forces `status: 'ARCHIVED'` regardless of any conflicting status filter, preventing incompatible dual constraints.
- **Pagination Cursor Stability** — Added explicit `documentId()` tie-breaker ordering to prevent duplicates/skips when Records share identical sort-field timestamps.

### Added
- **sourceRequestId** — New immutable provenance field on Record. Normal Records: null. Records from FormRequest completion: the originating requestId. Links Record ↔ FormRequest deterministically.
- **Archive Provenance** — `archivedAt` (server-authoritative timestamp) and `archivedBy` (canonical ActorRef) written when archiving, cleared on unarchive. Ready for Step 6 Ledger/Audit.
- **Recipient Membership Validation** — Both RecordDeliveryService and FormRequestService now verify the recipient is an ACTIVE member of the Organization Workspace (or the owner for Personal Workspaces). Suspended/LEFT/non-member recipients are rejected.
- **Date Range Filters** — `createdFrom` and `createdTo` implemented end-to-end: RecordQuery domain, Firestore repository (server-side `_createdAt` Timestamp filtering), and client-side filtering for collaboration bucket results.
- **resultRecordId Immutability** — Once set on a FormRequest, `resultRecordId` cannot be changed via Firestore Rules. Prevents pointing a completed request at an arbitrary Record.
- **Legacy Query Bounding** — `listByWorkspace()`, `listByStatus()`, `listByEntityRef()`, and `queryRecords()` now enforce an internal hard cap of 500 results. Browse operations should use `paginatedQuery()`.
- **Unit Tests** — formRequestService, secureShareService, recordOperationService, recordDeliveryService, recordQueryService service-level tests (idempotency, concurrency, membership validation, provenance, bucket semantics)
- **Emulator Security Tests** — Submitted Record data/entityReferences/sourceRequestId immutability, priority-only update allowed, priority+data denied, DRAFT data update allowed, archive-only update allowed, FormRequest resultRecordId immutability

### Architecture
- FormRequest completion no longer depends on RecordService. It builds the Record domain object directly and writes via `completeRequestAtomic` Firestore transaction.
- SecureShare redemption no longer uses read-then-update. Uses `redeemTokenAtomic` Firestore transaction.
- Services receive `membershipRepo` and `workspaceRepo` for recipient validation at the application layer (not just UI checks).

## [Step 5] — Record Operations & Collaboration Engine

### Added
- **Record Query Engine** — Paginated, filtered, sorted Record queries with bucket views (ALL, OWN, STARRED, SENT, RECEIVED, ARCHIVED)
- **Record Operation Service** — Priority changes, archive/unarchive, bulk operations (up to 50), submitted-data immutability enforcement
- **Record Delivery Service** — Record sharing/sending with lifecycle state machine (PENDING → DELIVERED → OPENED → ACKNOWLEDGED → ACCEPTED/DECLINED → COMPLETED/REVOKED)
- **Record Folder Service** — Workspace and user-scoped folders, folder items, starred state
- **Form Request Service** — Form request creation with locked Module Version, recipient lifecycle, atomic completion creating canonical Record
- **Secure Share Service** — QR/link foundation with SHA-256 token hashing, revocation, expiration, redemption limits
- **Record List UI** — Global Record list page (`/app/records`) with bucket tabs, filtering, sorting, pagination, bulk operations
- **Module Record List UI** — Module-scoped Record list (`/app/modules/:moduleId/records`) with "View Records" link from Module detail
- **Record Table component** — Reusable sortable table with selection, starring, status/priority badges
- **Firestore Security Rules** — Rules for deliveries, formRequests, folders, folder items, userRecordState, shareTokens
- **Firestore Indexes** — Composite indexes for all new collections (firestore.indexes.json)
- **Unit tests** — Domain model tests for recordQuery, delivery, formRequest, folder, userRecordState, secureShare
- **Emulator security tests** — Rules tests for all new collections (delivery, formRequest, folder, userRecordState, shareToken)
- **Infrastructure wiring** — All new repositories and services registered in services.js/repositories.js

### Architecture
- RecordService remains focused on canonical Record CRUD + lifecycle
- Six new focused services prevent monolith accumulation
- All services use factory pattern with dependency injection
- Workspace isolation enforced at Firestore Security Rules level
- User Record State isolated per-user (no cross-user leakage)
- Form Requests lock Module Version at creation (immutable provenance)
- Share tokens store only SHA-256 hashes (plaintext never persisted)

## [Unreleased]

### Added

- Step 0: Architecture Blueprint & Project Constitution.
  - Created architecture documentation in `docs/`.
  - Created minimal project scaffolding: Vite + React + Tailwind CSS + ESLint + Prettier + Vitest + Playwright.
  - Defined design system tokens and project structure.
- Step 1: Application Foundation.
  - Centralized configuration loader in `src/infrastructure/config/`.
  - Provider-independent identity contract and Firebase Auth adapter.
  - User model boundary mapping Firebase User to `UserIdentity`.
  - Auth Provider, protected/guest routes, login and registration pages.
  - Responsive authenticated shell with header, sidebar, and mobile drawer.
  - First Design System components: Button, IconButton, Input, PasswordInput, Label, Card, Badge, Alert, Dialog, Drawer, Dropdown, Spinner, LoadingState, ErrorState, EmptyState, PageContainer, PageHeader.
  - Application error model translating provider errors to user-safe messages.
  - Unit tests for configuration, identity mapping, auth state, protected routes, form validation, and Design System primitives.
  - GitHub Actions CI workflow running install, lint, test, and build.

- Step 2: Workspace & People Foundation.
  - Core domain models: Workspace, Organization, Membership, Role, Person/Profile, Group, Invitation.
  - Repository contract pattern: contracts in `core/workspace/`, Firestore implementations in `infrastructure/firebase/`.
  - Application services: WorkspaceService, OrganizationService, MembershipService, GroupService (React-independent).
  - Event bus foundation (`core/events/eventBus.js`) with event envelope schema.
  - WorkspaceProvider/Context with workspace switching, localStorage persistence, and access verification.
  - Personal Workspace auto-creation on first login (idempotent).
  - Organization creation flow: creates org + workspace + OWNER membership as one logical operation.
  - Role/capability authorization boundary with OWNER, ADMIN, MEMBER system roles.
  - Owner safety invariant: organization cannot end up with zero owners.
  - Workspace Switcher in header with "Create Organization" action.
  - Workspace-aware sidebar: organization nav items (People, Groups, Settings) only shown for organization workspaces.
  - Dashboard page showing current workspace and user info.
  - Create Organization page with validated form.
  - Organization Settings page with view/edit capability.
  - People page showing organization members with name, email, role, status.
  - Groups page with create/delete functionality.
  - Firestore integration via `firebase/firestore` with emulator support.
  - Firestore Security Rules in `firestore.rules`.
  - Route-level lazy loading for feature pages.
  - Platform events emitted for workspace/organization/membership/group operations.
  - `docs/WORKSPACE_MODEL.md` explaining workspace, membership, and people concepts.
  - 107 unit tests across 21 test files (61 new tests for Step 2).

- Step 2.1: Firestore Security Hardening.
  - Redesigned membership storage: subcollections at `organizations/{orgId}/members/{userId}` for deterministic Security Rules lookups.
  - Moved groups to `organizations/{orgId}/groups/{groupId}` subcollection.
  - Moved invitations to `organizations/{orgId}/invitations/{invitationId}` subcollection.
  - Added `userMemberships/{userId}/orgs/{orgId}` reverse index for efficient user membership queries.
  - Rewrote `firestore.rules` with organization isolation, role-based enforcement, field immutability, and deny-by-default.
  - Organization creation now uses atomic `writeBatch()` (org + workspace + membership + index in one commit).
  - Added `firestoreOrganizationBootstrap.js` for atomic org creation.
  - Security Rules prevent: cross-org access, self-promotion, OWNER escalation by non-OWNER, field tampering (organizationId, userId, type, ownerUserId, createdByUserId), suspended member access, unauthorized invitation creation/read, and access to unknown collections.
  - Added 64 Firebase Emulator Security Rules tests covering all attack vectors.
  - Updated `docs/SECURITY_MODEL.md` with rule patterns, trusted operations, and future collection requirements.
  - Updated `docs/WORKSPACE_MODEL.md` with new data architecture.
  - Added `npm run test:rules` command for emulator-based Security Rules testing.

- Step 3: Universal Data Core.
  - Core domain models: ActorRef, EntityType, Entity, Relationship, Record, FileMeta.
  - Entity Type Registry with CORE and DOMAIN categories.
  - 8 Core Entity Types seeded idempotently: PERSON, EMPLOYEE, CUSTOMER, SUPPLIER, VEHICLE, EQUIPMENT, LOCATION, DOCUMENT.
  - Schema contract for Entity Type field definitions (text, number, date, boolean, select, entity-reference, file-reference).
  - Entity Reference contract for typed, workspace-scoped cross-object links.
  - Reference Resolver with workspace isolation enforcement.
  - Relationship model supporting typed, workspace-scoped links between objects.
  - Record foundation with multi-actor model (createdBy, submittedBy), lifecycle (DRAFT through ARCHIVED), and entity reference validation.
  - File/Attachment metadata model with provider-independent storage contract.
  - Repository contracts: EntityTypeRepository, EntityRepository, RelationshipRepository, RecordRepository, FileRepository.
  - Firestore adapters for all 5 new collections under `workspaces/{workspaceId}/`.
  - Application services: EntityTypeService, EntityService, RelationshipService, RecordService, FileService (all React-independent).
  - Firestore Security Rules for entityTypes, entities, relationships, records, files — workspace ownership, immutable fields, CORE type protection, deny-by-default.
  - 35 new Firebase Emulator security tests (99 total) covering positive, negative, cross-workspace, immutable field, and deny-by-default scenarios.
  - 83 new unit tests (190 total) for all domain models, validation, schema contract, and core entity types.
  - Minimal Entity browser/detail UI: EntityTypesPage, EntitiesPage, EntityDetailPage.
  - Entity Type management UI with Domain type creation including field definitions.
  - Entity detail shows type, status, data, relationships, and related record count.
  - Platform events emitted for entity_type, entity, relationship, record, and file operations.
  - `docs/UNIVERSAL_DATA_CORE.md` documenting full architecture, query strategy, security rules, multi-industry proof.
  - Updated `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY_MODEL.md`, `AGENTS.md`.

- Step 3.1: Universal Data Integrity Hardening.
  - Full field type validation: text (string, minLength, maxLength), number (finite, min, max), date (ISO 8601), boolean, select (option set), entity-reference (canonical structure), file-reference (non-empty string).
  - Unknown-field policy: undeclared fields in Entity data are rejected.
  - Field definition hardening: key format validation (`/^[a-zA-Z][a-zA-Z0-9_]*$/`), duplicate key rejection, select options required, min/max consistency, minLength/maxLength consistency, required must be boolean.
  - `validateFieldDefinitions()` validates entire field set including cross-field uniqueness.
  - Canonical `validateEntityReference()` shared across EntityService, RecordService, and future consumers.
  - Entity Reference type integrity: `ref.entityTypeId` must match resolved entity's actual `entityTypeId`.
  - Record reference dual-storage: canonical `entityReferences[]` (source of truth) + derived `entityReferenceIds[]` (query index).
  - Entity Type existence and ACTIVE status check before Entity creation.
  - Entity update revalidation: data changes revalidated against Entity Type schema.
  - Record draft update revalidation: entityReferences, data, attachments revalidated; entityReferenceIds recomputed.
  - Actor identity enforcement in Firestore Rules: `isValidClientActor()` enforces `actorType == 'USER'` and `actorId == request.auth.uid` for all workspace data creates.
  - INTERNAL_AGENT and EXTERNAL_INTEGRATION rejected from client writes.
  - 13 new Firebase Emulator security tests (112 total) covering actor spoofing, trusted actor type rejection, cross-collection actor identity, and immutable actor fields.
  - 53 new unit tests (243 total) for field type validation, field definition validation, entity reference validation, record reference indexing, and actor ref edge cases.
  - Updated `docs/UNIVERSAL_DATA_CORE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY_MODEL.md`, `AGENTS.md`, `CHANGELOG.md`.

- Step 4: Module Engine + Form Schema + Form Renderer.
  - Module Definition domain model (`src/modules/module.js`) with moduleId, workspaceId, moduleCode, name, description, category, status, version, formSchema, recordConfig, displayConfig, primaryEntityTypeId, createdBy, timestamps.
  - Module identity: `moduleId` is immutable internal ID, `moduleCode` is stable human/developer-facing code (unique within workspace, immutable after creation).
  - Module lifecycle: DRAFT → ACTIVE → INACTIVE/ARCHIVED. DRAFT freely editable. ACTIVE modules increment version on schema changes. Archived modules preserved for historical Record interpretation.
  - Module versioning: integer `version` on Module; Records store `moduleId` + `moduleVersion`.
  - Shared field system: extended `FIELD_TYPES` in `entityType.js` with form-oriented types (textarea, email, phone, url, datetime). One coherent field system with `ENTITY_FIELD_TYPES` subset for Entity Type validation and full set for Form Schema validation.
  - Validation patterns: `ISO_DATETIME_PATTERN`, `EMAIL_PATTERN`, `PHONE_PATTERN`, `URL_PATTERN` added to core field validators.
  - Form Schema embedded in Module Definition: `{ schemaVersion, fields[] }` with ordered field definitions.
  - Form Schema Validator (`src/modules/forms/formSchemaValidator.js`): validates schema structure, validates form values against schema, extracts entity references, rejects undeclared fields, enforces entity reference integrity.
  - Structured validation error model: `{ valid: boolean, errors: { [fieldKey]: string } }`.
  - Field Registry (`src/modules/forms/fieldRegistry.js`): deterministic mapping from field type to React component, falls back to `UnsupportedField` for unknown types.
  - Generic Form Renderer (`src/modules/forms/FormRenderer.jsx`): schema-driven, renders fields in schema order via Field Registry, client-side validation, submit/draft buttons, accessible, no module-specific hardcoded JSX.
  - 12 field components: TextField, TextareaField, NumberField, DateField, DateTimeField, BooleanField, SelectField, EmailField, PhoneField, UrlField, EntityReferenceField, FileReferenceField, plus UnsupportedField fallback.
  - FieldWrapper component for consistent label, required indicator, help text, error display, and accessibility (aria-invalid, aria-describedby).
  - EntityReferenceField: loads entities from workspace filtered by entityTypeId, stores canonical `{ entityId, entityTypeId, workspaceId }`.
  - FileReferenceField: text input placeholder for file reference IDs (full upload deferred).
  - Display Formatter (`src/modules/forms/displayFormatter.js`): formats canonical Record values for human display.
  - ModuleService (`src/modules/moduleService.js`): CRUD, lifecycle transitions, code uniqueness, version management, immutable field protection, form schema validation.
  - ModuleSubmissionService (`src/modules/moduleSubmissionService.js`): orchestrator that loads Module, validates status, validates form values, extracts/resolves entity references, delegates to RecordService, creates exactly ONE canonical Record, emits platform events.
  - Module Repository contract (`src/modules/moduleRepository.js`) and Firestore adapter (`src/infrastructure/firebase/firestoreModuleRepository.js`).
  - Wired into `infrastructure/repositories.js` and `infrastructure/services.js`.
  - Module management UI: ModulesPage (list), CreateModulePage (manual builder), ModuleDetailPage (detail + preview), EditModulePage (DRAFT editing), ModuleFormPage (submission flow), RecordDetailPage (record display).
  - Manual Module Builder: define module name, code, category, form fields with type selection, options, entity type, required state, field ordering.
  - Route-level lazy loading for all module/record pages.
  - "My Modules" sidebar link enabled.
  - Demo modules: ROOM_INSPECTION (entity-reference, date, select, textarea, file-reference) and VEHICLE_INSPECTION (text, number, date, boolean, select, textarea).
  - Firestore Security Rules for `workspaces/{workspaceId}/modules/{moduleId}`: workspace ownership, authenticated access, actor validation (USER + own uid), immutable fields (workspaceId, moduleId, moduleCode, createdBy, createdAt), archived module protection, org workspace requires ADMIN/OWNER for create/update, delete denied.
  - 21 new Firebase Emulator security tests (133 total): module create/read for personal/org workspaces, cross-workspace isolation, actor spoofing, workspace mismatch, immutable field changes, archived module protection, delete protection, unauthenticated access.
  - 79 new unit tests (322 total): Module domain model, validateModuleCode, ModuleService (CRUD, lifecycle, versioning, immutability), Form Schema validation, form values validation, entity reference extraction, ModuleSubmissionService (submission pipeline, status checks, validation, draft/submit), demo module schemas, Field Registry, Display Formatter.
  - Updated `AGENTS.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY_MODEL.md`, `docs/UNIVERSAL_DATA_CORE.md`.

- Step 4.1: Module Version History & Record Provenance Hardening.
  - Record domain model: added `moduleVersion` field (positive integer, immutable after creation).
  - Module Version Snapshots: `workspaces/{workspaceId}/modules/{moduleId}/versions/{version}` — immutable historical schema snapshots.
  - Module Version snapshot domain model: `src/modules/moduleVersion.js` with frozen value objects.
  - Version creation lifecycle: first activation creates Version 1 snapshot; ACTIVE schema changes create next version atomically.
  - Atomic `moduleCode` reservation: `workspaces/{workspaceId}/moduleCodes/{code}` using `writeBatch`. Codes are never reused, even after archiving.
  - ModuleSubmissionService passes exact `moduleVersion` to RecordService; Record persists `moduleId`, `moduleVersion`, `recordType` as immutable provenance.
  - RecordService strips `moduleId`, `moduleVersion`, `recordType` from draft updates (provenance immutable).
  - RecordDetailPage loads historical Module Version schema via `record.moduleId` + `record.moduleVersion`. Falls back to current schema with warning if version snapshot not found.
  - ModuleService: `getModuleVersion()` and `listModuleVersions()` for historical schema retrieval.
  - Firestore Module Repository: version snapshot CRUD, code reservation, `writeBatch` atomicity for version creation + module update.
  - Firestore Rules: version snapshots (create + read allowed, update + delete denied), module code reservations (create + read allowed, update + delete denied), Record `moduleId`/`moduleVersion`/`recordType` immutable on update.
  - 24 new unit tests (346 total): Module Version snapshot domain model (8), ModuleService version snapshots (7), code uniqueness (2), ModuleSubmissionService `moduleVersion` provenance (4), Record `moduleVersion` domain model (6 new assertions across tests).
  - 28 new Firebase Emulator security tests (161 total): version snapshot immutability (13), module code reservation (11), Record provenance immutability (5).
  - Updated `AGENTS.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY_MODEL.md`, `docs/MODULE_CONTRACT.md`.

### Notes

- No Modulity V1 code imported.
- ListView, TableView, Ledger, Widgets, Reports, Chat, Notifications, Agents, Billing checkout, External API are intentionally not implemented in Step 4/4.1.
- Invitation acceptance, ownership transfer, OWNER role escalation still require Cloud Functions.
- File upload binary handling is deferred — only metadata model and storage contract established. FileReferenceField uses text input placeholder.
- Schema migration framework is documented conceptually but not implemented.
- Cross-workspace sharing is denied by default; future sharing system deferred.
- Module code uniqueness is now enforced via atomic `writeBatch` reservation in `workspaces/{workspaceId}/moduleCodes/{code}`. Concurrent creates fail atomically — the race condition from Step 4 is resolved.
- Submitted Record trust boundary: application-layer validation via ModuleSubmissionService; Firestore Rules enforce storage authorization and provenance immutability; future trusted backend enforcement may be needed for stronger validation guarantees. Browser form validation is UX; application service validation is deterministic business validation; Firestore Rules cannot reproduce arbitrary Module Form Schema validation.
- Rich text, signature, location, image, currency, multiselect, radio, domain-entity-reference, user-reference field types are documented in MODULE_CONTRACT.md but not yet implemented in the Field Registry (UnsupportedField fallback renders).
- **INVARIANT: A historical Record must always be interpretable using the exact Module Version that created it. Changing a Module tomorrow must never change the meaning of a Record created yesterday.**
