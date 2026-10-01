# Modulity 2.0 — Universal Data Core

## Overview

The Universal Data Core is the canonical data layer that all future Modules, Forms, Records, Lists, Ledger, Widgets, Reports, and Agents will use. It establishes the platform model for:

- **Entity** — persistent business identity
- **Entity Type** — typed, validated, versioned definitions (Core + Domain)
- **Relationship** — workspace-scoped links between objects
- **Record** — canonical business transaction / form submission
- **File / Attachment** — metadata for binary assets (PDF, image, etc.)
- **Actor Reference** — typed actor identity (USER, INTERNAL_AGENT, EXTERNAL_INTEGRATION)
- **Entity Reference** — typed reference contract for cross-object links

---

## Fundamental Rule

```
ENTITY != RECORD != MODULE
```

- An **Entity** is a persistent business identity (Employee, Vehicle, Room, Student).
- A **Record** is a canonical business event/transaction (Inspection, Request, Check-in).
- A **Module** defines how users create and interact with Records (future).

Entities are NOT owned by Modules. Modules work WITH Entities.

One form submission creates ONE canonical Record. Views (ListView, TableView, Ledger, Widget, Report) are projections over the same Record.

---

## Entity Type Architecture

### Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `CORE` | Platform-defined, reusable across industries | PERSON, EMPLOYEE, CUSTOMER, SUPPLIER, VEHICLE, EQUIPMENT, LOCATION, DOCUMENT |
| `DOMAIN` | Organization/industry-specific, extensible | ROOM, CLASSROOM, PRODUCTION, CONSTRUCTION_SITE |

### Entity Type Registry

Each Entity Type has:

```js
{
  typeId,        // immutable identifier
  code,          // unique code (e.g. "ROOM")
  name,          // display name
  category,      // CORE | DOMAIN
  description,
  icon,
  status,        // ACTIVE | INACTIVE | ARCHIVED
  schemaVersion, // for future migrations
  fields,        // field schema definitions
  workspaceId,   // workspace ownership
}
```

### Schema Contract (Field Definitions)

```js
{
  key: "roomNumber",       // must match /^[a-zA-Z][a-zA-Z0-9_]*$/
  label: "Room Number",
  type: "text",            // text | number | date | boolean | select | entity-reference | file-reference
  required: true,
  options: [],             // for select type (required for select, rejected for others)
  min: 0, max: 100,        // for number type
  minLength: 1, maxLength: 50, // for text type
}
```

**Field definition validation (Step 3.1):**
- `key` must start with a letter and contain only `[a-zA-Z0-9_]`
- `key` must be unique within an Entity Type
- `type` must be one of the supported `FIELD_TYPES`
- `required` must be a boolean if provided
- Select fields require a non-empty `options` array
- Number `min` must not exceed `max`
- Text `minLength` must not exceed `maxLength`

**Data validation (Step 3.1):**

| Type | Validation |
|------|------------|
| `text` | string, optional minLength/maxLength |
| `number` | finite number, optional min/max |
| `date` | ISO 8601 string (YYYY-MM-DD or full datetime), parseable |
| `boolean` | actual boolean value |
| `select` | value must be in configured options |
| `entity-reference` | canonical EntityReference structure `{ entityId, entityTypeId, workspaceId }` |
| `file-reference` | non-empty string (file ID) |

### Unknown-Field Policy

**Undeclared fields in Entity data are REJECTED.**

Entity data is schema-governed. If a field key is not defined in the Entity Type's `fields` array, `validateEntityData()` rejects it with an error. This prevents schema drift, garbage data, and bypasses of required-field validation.

This policy applies uniformly to: Web UI, future Form Renderer, Mobile, Internal Agent, External API, and Imports.

Core Entity Types are seeded idempotently per workspace. Domain types are created by users/organizations without changing Core code.

---

## Entity Instance Model

```js
{
  entityId,          // immutable
  workspaceId,       // immutable
  entityTypeId,      // immutable after creation
  displayName,
  status,            // ACTIVE | INACTIVE | ARCHIVED
  data,              // validated structured data per Entity Type schema
  attachments,       // file IDs
  createdAt,         // server-authoritative
  updatedAt,         // server-authoritative
  createdBy,         // ActorRef, immutable
  sourceRecordId,    // optional, links to creating Record
  schemaVersion,
}
```

### Entity Status

| Status | Meaning |
|--------|---------|
| `ACTIVE` | Normal operational state |
| `INACTIVE` | Temporarily disabled |
| `ARCHIVED` | Soft-deleted, retained for history |

Business workflow states (e.g. "under repair", "occupied") do NOT belong in Entity status. They are derived from Records or business data.

---

## Entity Reference Contract

```js
{
  entityId,
  entityTypeId,
  workspaceId,
}
```

References resolve to the current Entity. Entity data is NOT copied into Records.

**Reference integrity enforcement (Step 3.1):**

1. **Structural validation**: `validateEntityReference()` checks entityId, entityTypeId, workspaceId are non-empty strings.
2. **Workspace isolation**: cross-workspace references are DENIED.
3. **Entity existence**: referenced entity must exist.
4. **Type integrity**: `ref.entityTypeId` must match the actual entity's `entityTypeId`. A reference claiming ROOM must not resolve to a VEHICLE.

One canonical `validateEntityReference()` function is shared across EntityService, RecordService, and future consumers. No duplicated validation logic.

---

## Relationship Model

```js
{
  relationshipId,    // immutable
  workspaceId,       // immutable
  source: { objectType, objectId },
  relationshipType,  // extensible (ASSIGNED_TO, USES, PART_OF, etc.)
  target: { objectType, objectId },
  metadata,          // optional extra data
  status,            // ACTIVE | ARCHIVED
  createdAt,
  createdBy,         // ActorRef, immutable
}
```

### Object Types

Supported: `ENTITY`, `RECORD`, `MODULE` (future), `FILE` (future).

Step 3 fully validates ENTITY relationships. Module/File relationships deferred.

### Integrity Rules

- Source and target must exist in the same workspace.
- Relationship types are extensible (platform-defined and organization-defined).
- Archiving an entity does NOT cascade-delete relationships; they remain for history.
- No dangling relationships permitted on creation.

---

## Record Foundation

```js
{
  recordId,           // immutable
  workspaceId,        // immutable
  moduleId,           // optional, future module association
  recordType,         // e.g. "ROOM_INSPECTION"
  status,             // DRAFT | SUBMITTED | ACTIVE | COMPLETED | CANCELLED | ARCHIVED
  priority,           // null | LOW | MEDIUM | HIGH | CRITICAL
  createdBy,          // ActorRef, immutable
  submittedBy,        // ActorRef, optional
  data,               // structured record payload
  entityReferences,   // canonical EntityReference[] (source of truth)
  entityReferenceIds, // derived string[] for array-contains queries (index only)
  attachments,        // file IDs
  createdAt,
  updatedAt,
  submittedAt,
  schemaVersion,
}
```

### Record vs Entity Examples

| Entity | Record |
|--------|--------|
| Room 214 | Room Inspection on 2026-10-01 |
| Vehicle AB-CD-123 | Vehicle Inspection |
| Employee George | Holiday Request |
| Guest John Smith | Guest Check-in |

### Record Actors

The architecture supports distinct actor roles:

- `createdBy` — who created the record
- `submittedBy` — who submitted (may differ from creator)
- Future: `issuedBy`, `assignedTo`, `recipient`, `approvedBy`

Actor types: `USER`, `INTERNAL_AGENT`, `EXTERNAL_INTEGRATION`.

---

## File / Attachment Architecture

```js
{
  fileId,
  workspaceId,
  name,              // original filename
  mimeType,
  size,              // bytes
  storageProvider,   // e.g. "firebase-storage"
  storagePath,       // provider-specific path
  checksum,          // optional integrity hash
  uploadedBy,        // ActorRef
  createdAt,
}
```

### Firebase Storage Boundary

- Metadata is stored in Firestore (`workspaces/{wsId}/files/{fileId}`).
- Binary data is stored in Firebase Storage.
- A provider-independent `FileStorageContract` defines: `upload()`, `getDownloadUrl()`, `remove()`.
- Firebase Storage SDK calls are isolated in infrastructure adapters, never in React components.
- File metadata is immutable after creation (no update, no delete via client).

---

## Firestore Collection Structure

```
workspaces/{workspaceId}/
  ├── entityTypes/{typeId}
  ├── entities/{entityId}
  ├── relationships/{relationshipId}
  ├── records/{recordId}
  └── files/{fileId}
```

All workspace data subcollections enforce:
- Workspace ownership (personal owner or org active membership)
- Immutable security fields (workspaceId, createdBy, etc.)
- No cross-workspace access
- Deny-by-default for unknown collections

---

## Query & Indexing Strategy

| Query Pattern | Method |
|---------------|--------|
| Entities by type | `where('entityTypeId', '==', typeId)` |
| Entities by status | `where('status', '==', status)` |
| Relationships for object | `where('source.objectType/objectId')` + `where('target.objectType/objectId')` |
| Records by entity reference | `where('entityReferenceIds', 'array-contains', entityId)` |
| Records by status | `where('status', '==', status)` |
| Records by type | `where('recordType', '==', type)` |
| Entity types by category | `where('category', '==', category)` |

All queries are workspace-scoped (bounded by subcollection path). No unbounded client-side scans.

---

## Record Reference Indexing Strategy (Step 3.1)

Records reference Entities via two complementary fields:

```js
entityReferences: [
  { entityId: "room-1", entityTypeId: "room-type", workspaceId: "ws-1" },
  { entityId: "guest-1", entityTypeId: "core:person", workspaceId: "ws-1" },
]

entityReferenceIds: ["room-1", "guest-1"]
```

- **`entityReferences`** is the **source of truth** — canonical EntityReference objects with full type and workspace information.
- **`entityReferenceIds`** is a **derived index** — flat ID array for efficient Firestore `array-contains` queries.
- `entityReferenceIds` is always derived from `entityReferences`. It is never set independently.
- This avoids two independent sources of truth while enabling efficient querying.

---

## Actor Identity Security (Step 3.1)

### Architectural Rule

```
CLIENTS MAY NOT SELF-ASSERT TRUSTED ACTOR TYPES.
```

INTERNAL_AGENT and EXTERNAL_INTEGRATION actions must eventually enter through a trusted backend/API boundary.

### Firestore Rules Enforcement

For all client-created workspace data (entities, records, relationships, files):

- `createdBy.actorType` must be `USER`
- `createdBy.actorId` must equal `request.auth.uid`
- `INTERNAL_AGENT` and `EXTERNAL_INTEGRATION` are rejected by client writes
- `createdBy` / `uploadedBy` are immutable after creation

### Canonical Date Representation

All date field values use **ISO 8601** string format:

- Short form: `YYYY-MM-DD` (e.g. `2024-03-15`)
- Full form: `YYYY-MM-DDTHH:mm:ssZ` (e.g. `2024-03-15T10:30:00Z`)

Validation uses `Date.parse()` and confirms the result is a valid date.

---

## Entity Lifecycle Validation (Step 3.1)

### Entity Creation

1. Entity Type must exist in the same workspace
2. Entity Type must be `ACTIVE` (not `ARCHIVED` or `INACTIVE`)
3. Entity data is validated against Entity Type schema
4. Undeclared fields are rejected
5. Required fields must be present
6. Field values must match their declared type

### Entity Update

1. Immutable fields preserved: `entityId`, `workspaceId`, `entityTypeId`, `createdBy`, `createdAt`
2. If `data` changes, the complete resulting data is revalidated against the Entity Type schema
3. If `attachments` change, each attachment is validated as a non-empty string

### Record Creation

1. All `entityReferences` validated: canonical structure, workspace match, entity existence, type integrity
2. `entityReferenceIds` derived from validated references
3. Attachments validated

### Record Draft Update

1. Only `DRAFT` records can be updated
2. Changes merged with existing state
3. All entity references revalidated against workspace/existence/type integrity
4. `entityReferenceIds` recomputed from merged references
5. A valid Record at creation cannot become invalid through updates

---

## Security Rules Summary

| Collection | Read | Create | Update | Delete |
|------------|------|--------|--------|--------|
| entityTypes | workspace member | workspace member | admin/owner (DOMAIN only; CORE protected) | never |
| entities | workspace member | workspace member (createdBy required) | workspace member (immutable: workspaceId, entityId, createdBy) | never |
| relationships | workspace member | workspace member (workspaceId must match) | workspace member (immutable: workspaceId, createdBy) | never |
| records | workspace member | workspace member (createdBy required) | workspace member (immutable: workspaceId, recordId, createdBy) | never |
| files | workspace member | workspace member (workspaceId must match) | never | never |

---

## Core Entity Type Seeding

The 8 initial Core Entity Types are seeded idempotently per workspace:

1. PERSON
2. EMPLOYEE
3. CUSTOMER
4. SUPPLIER
5. VEHICLE
6. EQUIPMENT
7. LOCATION
8. DOCUMENT

Seeding is safe to run repeatedly — existing types are not overwritten.

---

## Multi-Industry Proof

The same architecture supports:

| Industry | Entity Type | Same Core Runtime |
|----------|-------------|-------------------|
| Hotel | ROOM, GUEST, RESERVATION | Yes |
| School | STUDENT, CLASSROOM, COURSE | Yes |
| Theatre | PRODUCTION, PERFORMANCE, PROP | Yes |
| Construction | SITE, MACHINE, WORK_ORDER | Yes |

Replacing ROOM with CLASSROOM or PRODUCTION requires only configuration/schema changes, not new Core code.

---

## Event Model

Non-authoritative platform events emitted:

- `entity_type.created`, `entity_type.updated`
- `entity.created`, `entity.updated`, `entity.archived`
- `relationship.created`, `relationship.archived`
- `record.created`, `record.updated`, `record.cancelled`, `record.archived`
- `file.registered`

Platform Events are NOT durable audit records or ledger entries.

---

## Archive vs Delete

Default behavior is archive, not hard delete:

- **Entity**: archive (status → ARCHIVED)
- **Relationship**: archive
- **Record**: cancel/archive per lifecycle
- **Files**: deletion policy deferred

No destructive deletion of historical business data. Future legal/privacy erasure is a separate controlled process.

---

## Schema Versioning

All extensible data contracts include a `schemaVersion` field:

- Entity Type
- Entity
- Record

No migration framework yet. Future schema migrations will compare `schemaVersion` and apply transformations.

---

## Intentionally NOT Implemented

- Module Engine / AI Module Builder / Form Renderer
- Full Record UI / ListView / TableView
- Send/Receive / QR sharing / Approval Workflow
- Ledger numbering / books
- Widgets / Reports / Worksets
- Notifications / Chat
- Automat Builder / Agent execution / External Agent API
- Payment / Subscription
- Full File Manager
- Industry-specific systems (hotel, school, etc.)
- Cross-workspace sharing
- Human-readable ledger numbering (future Ledger Engine)

---

## Open Questions for Step 4

1. Module Engine contract and how Modules consume Entity Types
2. Form Renderer consuming schema field definitions
3. Cross-workspace sharing policy
4. Full audit/event trail vs platform events
5. Entitlement/billing integration points
6. File deletion policy and Firebase Storage cleanup
7. Schema migration framework design
8. Advanced relationship types (bidirectional, hierarchical)
