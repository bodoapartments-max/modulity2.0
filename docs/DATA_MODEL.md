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

### Entity Model

- `entityId` — immutable internal ID
- `organizationId`
- `entityType` — references a Core or Domain Entity definition
- `displayName`
- `metadata` — type-specific attributes
- Created/updated timestamps
- Soft-delete flag

An Entity exists once. Modules reference it. Example: Room 214 is referenced by Reservation, Housekeeping, Maintenance and Damage Report modules.

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
