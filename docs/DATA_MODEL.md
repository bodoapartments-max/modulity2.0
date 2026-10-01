# Modulity 2.0 — Conceptual Data Model

This document defines the canonical data entities and their relationships.

---

## 1. Identity & Workspace

### User

- Immutable internal `userId`
- Email (unique, verified)
- Display name
- Personal workspace reference
- Created/updated timestamps

### Organization (Workspace)

- Immutable internal `organizationId`
- Human-friendly name and code
- Type (company, school, hotel, theatre, ...)
- Created by user
- Settings / billing reference

### Membership

- Immutable internal `membershipId`
- `userId` ↔ `organizationId`
- Role
- Position / department / groups
- Module access scope
- Status (active, invited, suspended, removed)
- Subscription-derived access flags

> Do not store organization-specific roles on the global User.

---

## 2. Entities

### Core Entity

Reusable operational objects common to many industries:

- Employee
- Vehicle
- Equipment
- Customer
- Supplier
- Project
- Location
- Document

### Domain Entity

Industry-specific operational objects:

- Hotel: Room, Reservation, Stay
- Theatre: Production, Performance, Rehearsal, Prop, Costume
- School: Student, Class, Course

### Entity Type Registry (Step 3, hardened Step 3.1)

Entity Types are registered per workspace with metadata:

- `typeId` — immutable internal ID
- `code` — unique code (e.g. "ROOM")
- `name` — display name
- `category` — CORE | DOMAIN
- `description`, `icon`
- `status` — ACTIVE | INACTIVE | ARCHIVED
- `schemaVersion`
- `fields` — typed field definitions (key, label, type, required, constraints)
- `workspaceId` — workspace ownership

Field types: `text`, `number`, `date`, `boolean`, `select`, `entity-reference`, `file-reference`.

**Step 3.1 hardening:**
- Field keys validated against `/^[a-zA-Z][a-zA-Z0-9_]*$/`
- Duplicate field keys rejected within an Entity Type
- Select fields require non-empty options array
- Number min/max consistency enforced
- Text minLength/maxLength consistency enforced
- `required` must be boolean
- Entity creation requires Entity Type with status `ACTIVE`

### Entity Model (Step 3 — Implemented)

- `entityId` — immutable internal ID
- `workspaceId` — immutable, workspace ownership
- `entityTypeId` — immutable after creation
- `displayName`
- `status` — ACTIVE | INACTIVE | ARCHIVED
- `data` — validated structured data per Entity Type schema
- `attachments` — file IDs
- `createdAt` — server-authoritative
- `updatedAt` — server-authoritative
- `createdBy` — ActorRef (immutable)
- `sourceRecordId` — optional, links to creating Record
- `schemaVersion`

An Entity exists once. Modules reference it. Example: Room 214 is referenced by Reservation, Housekeeping, Maintenance and Damage Report modules.

### Canonical EntityReference (Step 3, hardened Step 3.1)

```js
{ entityId, entityTypeId, workspaceId }
```

- One canonical `validateEntityReference()` function validates structure
- Resolution verifies: workspace match, entity existence, type integrity (`ref.entityTypeId == entity.entityTypeId`)
- Used by EntityService, RecordService, and future consumers

### Actor Reference (Step 3, hardened Step 3.1)

Reusable typed actor identity:

- `actorType` — USER | INTERNAL_AGENT | EXTERNAL_INTEGRATION
- `actorId` — actor identifier (non-empty string)

Used across entities, records, relationships, files, and events.

**Step 3.1 restriction:** Clients may only write `actorType: 'USER'` with `actorId == auth.uid`. Trusted actor types blocked from client writes.

---

## 3. Module

- `moduleId` — immutable internal ID
- `version` — semantic version of this module instance
- `name`, `description`, `category`
- `moduleCode` — stable machine identifier
- `schemaVersion` — contract version
- `organizationId`
- Manifest fields:
  - `entitiesCreated`
  - `entitiesUsed`
  - `domainEntitiesCreated`
  - `domainEntitiesUsed`
  - `formSchema`
  - `listViewDefinition`
  - `tableViewDefinition`
  - `widgetCapabilities`
  - `reportCapabilities`
  - `supportedActions`
  - `supportedStatuses`
  - `supportedPermissions`
  - `relationships`
  - `assignments`
  - `configuration`
  - `capabilities`

See `MODULE_CONTRACT.md` for the full contract.

---

## 4. Record

The canonical operational object.

- `recordId` — immutable internal ID (collision-resistant, e.g. UUID / NanoID)
- `referenceNumber` — human-readable number (NOT the database identity)
- `organizationId`
- `moduleId`
- `formSchemaId` / `formSchemaVersion`
- `creatorId`
- `creationTimestamp` — server-authoritative
- `lastUpdateTimestamp` — server-authoritative
- `status` — lifecycle state
- `priority`
- `assigneeId`
- `recipientId`
- `issuerId`
- `submitterId`
- `entityReferences` — links to Core/Domain Entity instances
- `relationships` — links to other Records
- `formData` — validated form payload
- `attachments` — file references
- `lifecycleState`
- `auditContext` — created from / updated from / revision

> `referenceNumber` is for human convenience only. It may be sequential within a ledger book. It is never used as the authoritative identity.

---

## 5. Record Lifecycle

Possible lifecycle states (modules configure a subset):

- Draft
- Created
- Assigned
- Sent
- Delivered
- Viewed
- In Progress
- Submitted
- Returned
- Approved
- Rejected
- Completed
- Cancelled
- Archived

Each transition is an event. Transitions are validated by the Module Runtime against the module's configured lifecycle graph.

---

## 6. Relationships & Assignments

### Relationship

- `relationshipId`
- `organizationId`
- Source and target (`recordId` and/or `entityId`)
- `relationshipType`
- Created by / timestamp

### Assignment

- `assignmentId`
- `organizationId`
- Target (`recordId` / `entityId`)
- `assigneeId` (user or group)
- `assignedById`
- `from` / `until`
- Status

---

## 7. Ledger

Ledger is durable historical registration, not just a filtered ListView.

### LedgerBook

- `bookId`
- `organizationId`
- `moduleId`
- `bookNumber`
- `startSequence` / `endSequence`
- `allocationSize`
- Status (open, closed, archived)
- Opened/closed timestamps

### LedgerSequence

- `sequenceId`
- `bookId`
- `recordId`
- `sequenceNumber`
- `referenceNumber` (human-facing, e.g. `001`)
- Status (active, cancelled, crossed-out)

Records removed from operational views remain in Ledger history, optionally marked as crossed-out.

### AuditEvent

- `auditEventId`
- `organizationId`
- Actor (`userId` / `serviceId`)
- Action
- Target (`recordId` / `entityId` / `bookId`)
- Timestamp — server-authoritative
- Diff / reason
- Client metadata

---

## 8. Sharing

- `shareId`
- `organizationId`
- Target (`recordId` / `entityId`)
- Share type: user, member, group, email, secure link, QR
- Permissions granted
- Expiration
- Audit trail

---

## 9. Widgets & Reports

### Widget

- `widgetId`
- `organizationId`
- `type` (KPI, assignment, list, chart)
- `source` (module / entity)
- `filter`
- `metric`
- `configuration`

### ReportDefinition

- `reportDefinitionId`
- `organizationId`
- `name`
- Source modules / entities
- Aggregation rules
- Output format configuration

### ReportRun

- `reportRunId`
- `reportDefinitionId`
- Run timestamp
- Parameters
- Result snapshot

---

## 10. Notifications & Chat

### Notification

- `notificationId`
- Recipient `userId`
- Event reference
- Channel (in-app, email, push)
- Status (unread, read, dismissed)
- Timestamp

### Chat

Chat is a platform capability, not part of the Record model. Messages may reference Records/Entities.

---

## 11. Billing

### Plan

- `planId`
- Capabilities and limits

### Subscription

- `subscriptionId`
- `organizationId` or `userId`
- `planId`
- Status
- Billing period

### Entitlement

- Capability name (`connections`, `advanced-reports`, ...)
- Limit / current usage

See `BILLING_MODEL.md` for details.

---

## Module Definition (Step 4)

Path: `workspaces/{workspaceId}/modules/{moduleId}`

| Field | Type | Notes |
|-------|------|-------|
| `moduleId` | string | Immutable. Internal identifier. |
| `workspaceId` | string | Immutable. Workspace ownership. |
| `moduleCode` | string | Immutable. Stable human/developer-facing code (e.g. `ROOM_INSPECTION`). Unique within workspace. |
| `name` | string | Human-readable display name. Mutable. |
| `description` | string | Optional. |
| `category` | string | Organizational metadata (e.g. "Operations", "HR"). |
| `status` | string | `DRAFT` / `ACTIVE` / `INACTIVE` / `ARCHIVED` |
| `version` | number | Integer. Incremented on ACTIVE schema changes. |
| `formSchema` | object | `{ schemaVersion, fields[] }` — ordered field definitions. |
| `recordConfig` | object | `{ recordType }` — derived from moduleCode by default. |
| `displayConfig` | object | `{ primaryField, listFields }` — presentation metadata. |
| `primaryEntityTypeId` | string? | Entity Type this module primarily works with. |
| `createdBy` | ActorRef | Immutable. |
| `createdAt` | string | Immutable. |
| `updatedAt` | string | Auto-updated. |

### Form Schema

```json
{
  "schemaVersion": "1.0.0",
  "fields": [
    {
      "key": "room",
      "label": "Room",
      "type": "entity-reference",
      "required": true,
      "entityTypeId": "ROOM"
    }
  ]
}
```

Field types use the shared `FIELD_TYPES` from `core/data/entityType.js`. Entity Types use the `ENTITY_FIELD_TYPES` subset; Form Schemas use the full set.

## Module Version Snapshot (Step 4.1)

Path: `workspaces/{workspaceId}/modules/{moduleId}/versions/{version}`

**IMMUTABLE after creation. No updates, no deletes.**

| Field | Type | Notes |
|-------|------|-------|
| `moduleId` | string | Must match parent document. |
| `workspaceId` | string | Must match parent workspace. |
| `version` | number | Positive integer. Document ID = `String(version)`. |
| `moduleCode` | string | Stable identity code at time of version creation. |
| `name` | string | Display name at time of version creation. |
| `formSchema` | object | `{ schemaVersion, fields[] }` — the exact schema for this version. |
| `recordConfig` | object | `{ recordType }` |
| `displayConfig` | object | Presentation metadata. |
| `primaryEntityTypeId` | string? | Entity Type reference. |
| `createdBy` | ActorRef | Who activated/versioned this snapshot. |
| `createdAt` | string | When this version snapshot was created. |

## Module Code Reservation (Step 4.1)

Path: `workspaces/{workspaceId}/moduleCodes/{normalizedCode}`

**IMMUTABLE after creation. No updates, no deletes. Codes are never reused.**

| Field | Type | Notes |
|-------|------|-------|
| `moduleCode` | string | The reserved code. |
| `moduleId` | string | Owning module. |
| `workspaceId` | string | Must match workspace path. |
| `reservedBy` | ActorRef | Who reserved the code. |
| `reservedAt` | timestamp | Server timestamp. |

### Module → Record Relationship

**INVARIANT: A historical Record must always be interpretable using the exact Module Version that created it. Changing a Module tomorrow must never change the meaning of a Record created yesterday.**

Records created from a Module include:
- `moduleId` — which Module created this Record (immutable after creation)
- `moduleVersion` — exact Module version used when the Record was created (immutable after creation, positive integer)
- `recordType` — from `recordConfig.recordType` (immutable after creation)
- `data` — validated form values
- `entityReferences` — canonical references extracted from form values
- `entityReferenceIds` — derived query index

The authoritative historical interpretation key is: `workspaceId` + `moduleId` + `moduleVersion`. Do NOT use the current Module schema, module name, or recordType alone to determine historical form structure.
