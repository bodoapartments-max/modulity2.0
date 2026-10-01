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
