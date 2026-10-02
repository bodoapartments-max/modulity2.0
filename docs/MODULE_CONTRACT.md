# Modulity 2.0 — Module Contract

This document defines the versioned contract every native Modulity module must follow so the platform knows how the module participates in forms, records, views, permissions, events, widgets and reports.

---

## 1. Contract Version

- `schemaVersion`: `1.0.0` (semantic version of this contract specification)
- Each module declares the contract version it implements.
- The Module Runtime uses this version to negotiate behavior.

---

## 2. Module Manifest

```json
{
  "moduleId": "mod:<uuid>",
  "moduleCode": "vehicle-inspection",
  "version": "1.0.0",
  "schemaVersion": "1.0.0",
  "name": "Vehicle Inspection",
  "description": "Daily vehicle inspection and damage reporting.",
  "category": "operations",
  "organizationId": "org:<uuid>",
  "capabilities": {
    "canCreateRecords": true,
    "canSendRecords": true,
    "canAssignRecords": true,
    "supportsLedger": true,
    "supportsWidgets": true,
    "supportsReports": true
  },
  "entitiesCreated": ["core/Vehicle"],
  "entitiesUsed": ["core/Employee", "core/Location"],
  "domainEntitiesCreated": [],
  "domainEntitiesUsed": [],
  "formSchema": {/* see section 3 */},
  "listViewDefinition": {/* see section 4 */},
  "tableViewDefinition": {/* see section 4 */},
  "detailViewDefinition": {/* see section 4 */},
  "widgetCapabilities": [/* see section 5 */],
  "reportCapabilities": [/* see section 6 */],
  "supportedActions": [
    "create",
    "saveDraft",
    "send",
    "assign",
    "submit",
    "approve",
    "reject",
    "return",
    "complete",
    "cancel",
    "archive"
  ],
  "supportedStatuses": [
    { "id": "draft", "label": "Draft", "isTerminal": false },
    { "id": "created", "label": "Created", "isTerminal": false },
    { "id": "assigned", "label": "Assigned", "isTerminal": false },
    { "id": "submitted", "label": "Submitted", "isTerminal": false },
    { "id": "approved", "label": "Approved", "isTerminal": true },
    { "id": "rejected", "label": "Rejected", "isTerminal": true },
    { "id": "cancelled", "label": "Cancelled", "isTerminal": true }
  ],
  "lifecycleTransitions": [
    { "from": "draft", "to": "created", "action": "create" },
    { "from": "created", "to": "assigned", "action": "assign" },
    { "from": "assigned", "to": "submitted", "action": "submit" },
    { "from": "submitted", "to": "approved", "action": "approve" },
    { "from": "submitted", "to": "rejected", "action": "reject" },
    { "from": "created", "to": "cancelled", "action": "cancel" }
  ],
  "supportedPermissions": [
    "module:vehicle-inspection:create",
    "module:vehicle-inspection:read",
    "module:vehicle-inspection:update",
    "module:vehicle-inspection:delete",
    "module:vehicle-inspection:assign",
    "module:vehicle-inspection:approve"
  ],
  "relationships": {
    "allowed": ["core/Employee", "core/Vehicle"],
    "cardinality": { "core/Vehicle": "one", "core/Employee": "many" }
  },
  "assignments": {
    "targetTypes": ["record"],
    "defaultAssigneeRole": "inspector"
  },
  "configuration": {
    "ledgerBookAllocation": 100,
    "defaultPriority": "medium",
    "allowDrafts": true
  },
  "events": {
    "emits": [
      "record.created",
      "record.assigned",
      "record.submitted",
      "record.approved",
      "record.rejected"
    ]
  }
}
```

---

## 3. Form Schema

The form schema configures the generic renderer. It is not compiled into a unique component.

```json
{
  "formSchemaId": "form:<uuid>",
  "version": "1.0.0",
  "fields": [
    {
      "id": "vehicle",
      "type": "entity-reference",
      "label": "Vehicle",
      "entityType": "core/Vehicle",
      "required": true,
      "cardinality": "one"
    },
    {
      "id": "inspectionDate",
      "type": "datetime",
      "label": "Inspection Date",
      "required": true
    },
    {
      "id": "mileage",
      "type": "number",
      "label": "Mileage",
      "min": 0
    },
    {
      "id": "damage",
      "type": "checkbox",
      "label": "Damage Reported"
    },
    {
      "id": "photos",
      "type": "image",
      "label": "Photos",
      "multiple": true,
      "maxFiles": 5
    },
    {
      "id": "inspectorNotes",
      "type": "textarea",
      "label": "Notes",
      "maxLength": 2000
    }
  ],
  "layout": {/* optional responsive layout hints */},
  "validation": {
    "rules": [{ "if": "damage", "then": { "required": ["photos", "inspectorNotes"] } }]
  }
}
```

### Supported Field Types (v1)

- `text`
- `textarea`
- `number`
- `currency`
- `date`
- `datetime`
- `select`
- `multiselect`
- `checkbox`
- `radio`
- `file`
- `image`
- `signature`
- `entity-reference`
- `domain-entity-reference`
- `user-reference`
- `location`
- `rich-text` (sanitized HTML)

Custom field types are registered through a controlled extension mechanism.

---

## 4. View Definitions

Views are projections of canonical Record data. They do not own data.

### ListView Definition

```json
{
  "columns": [
    { "field": "referenceNumber", "label": "Ref", "sortable": true },
    { "field": "formData.vehicle.displayName", "label": "Vehicle" },
    { "field": "status", "label": "Status" },
    { "field": "assignee.displayName", "label": "Assigned" },
    { "field": "creationTimestamp", "label": "Created", "type": "datetime" }
  ],
  "filters": ["status", "priority", "dateRange", "assignee", "module"],
  "defaultSort": { "field": "creationTimestamp", "direction": "desc" }
}
```

### TableView Definition

Similar to ListView but optimized for dense data with bulk operations and pagination.

### DetailView Definition

Defines which sections and related records appear on the Record detail page.

---

## 5. Widget Capabilities

Modules declare what widgets can consume their records.

```json
[
  {
    "widgetType": "kpi",
    "label": "Pending inspections",
    "filter": { "status": "assigned" },
    "metric": "count"
  },
  {
    "widgetType": "assignment",
    "label": "Vehicle assignments",
    "entityType": "core/Vehicle",
    "fields": ["vehicle", "assignee", "from", "until"]
  }
]
```

---

## 6. Report Capabilities

Modules declare how they can participate in cross-module reports.

```json
[
  {
    "reportType": "aggregate",
    "label": "Inspections by status",
    "groupBy": "status",
    "metrics": ["count", "averageMileage"]
  }
]
```

---

## 7. Runtime Contract

The Module Runtime expects each module to provide:

1. A manifest conforming to this contract.
2. A form schema that the generic renderer can render.
3. A lifecycle graph with valid transitions.
4. Permission declarations.
5. Entity/domain-entity references used or created.
6. Event declarations.

The Runtime guarantees:

- Records are created, validated and stored through canonical Core services.
- Lifecycle transitions are validated before persistence.
- Views render using shared engines.
- Widgets and reports query canonical Record data through defined contracts.
- Events are emitted with the declared event types.

---

## 8. Versioning (updated Step 4.1)

### Key Invariants

> **A HISTORICAL RECORD MUST ALWAYS BE INTERPRETABLE USING THE EXACT MODULE VERSION THAT CREATED IT.**

> **MODULE != MODULE VERSION.** The Module represents the current configurable business definition. A Module Version is an immutable historical definition.

> **RECORD != MODULE.** Every Module-created Record permanently stores: `moduleId`, `moduleVersion`.

> Changing a Module tomorrow must never change the meaning of a Record created yesterday.

> `moduleCode` is stable workspace identity and must be atomically unique.

### Version Lifecycle

- `moduleCode` is stable and immutable after creation.
- `version` is a positive integer (1, 2, 3, ...).
- **DRAFT** modules are freely editable. No version snapshots are created until first activation.
- **First activation** creates immutable Version 1 snapshot at `modules/{moduleId}/versions/1`.
- **ACTIVE schema changes** create the next immutable version snapshot. Version N-1 remains unchanged.
- **ARCHIVED** modules and their version snapshots remain readable for historical Record interpretation.

### Version Snapshot Storage

```
workspaces/{workspaceId}/modules/{moduleId}/versions/{version}
```

Each snapshot contains: `moduleId`, `workspaceId`, `version`, `moduleCode`, `name`, `formSchema`, `recordConfig`, `displayConfig`, `primaryEntityTypeId`, `createdBy`, `createdAt`.

### Record Provenance

Every Module-created Record explicitly stores:
```json
{
  "moduleId": "...",
  "moduleVersion": 3,
  "recordType": "ROOM_INSPECTION"
}
```

These fields are **immutable after Record creation** — enforced at both application layer and Firestore Rules.

The authoritative historical interpretation key is: `workspaceId` + `moduleId` + `moduleVersion`.

Do NOT use: current Module schema, module name, or recordType alone.

### Historical Record Rendering

RecordDetailPage loads the Module Version snapshot via `record.moduleId` + `record.moduleVersion` and uses that snapshot's `formSchema`, `recordConfig`, and `displayConfig` for rendering. It does NOT silently fall back to the current Module schema for historical Records.

### Module Code Uniqueness

```
workspaces/{workspaceId}/moduleCodes/{normalizedCode}
```

Codes are reserved atomically via `writeBatch` during Module creation. A reservation identifies the owning `moduleId`. Codes are **never reused**, even after archiving. Reservations cannot be updated or deleted.

### Atomicity

- Module creation + code reservation: `writeBatch` (both succeed or both fail).
- First activation + Version 1 snapshot: `writeBatch`.
- ACTIVE schema change + Version N snapshot + Module update: `writeBatch`.
- Record creation with module provenance: application-layer determinism (ModuleSubmissionService captures exact version before validation and passes it to RecordService).

### Trusted Submission Limitation

- Browser form validation = UX.
- ModuleSubmissionService = deterministic business validation.
- Firestore Rules = storage authorization boundary.
- Firestore Rules cannot fully reproduce arbitrary Module Form Schema validation.
- A malicious client with direct Firestore access could construct semantically invalid `Record.data`.
- This is documented as an explicit limitation until final submission moves behind a trusted backend.

### Registry (future)

- The registry may store all installed versions and resolve the active version per workspace.
- Backward-incompatible manifest changes may require a new `moduleCode` or explicit migration logic.

---

## Module Ledger Configuration (Step 6)

Modules may optionally declare Ledger behavior through `ledgerConfig`:

```javascript
ledgerConfig: {
  enabled: true,           // Whether Records auto-register in Ledger
  ledgerBookId: "lb-xxx",  // Target LedgerBook ID
  registerOnSubmit: true   // Auto-register on Record submission
}
```

### Rules
- `ledgerConfig` is optional — modules without it work normally
- `ledgerConfig` is included in Module Version snapshots
- `enabled: false` or missing config = no automatic ledger participation
- `registerOnSubmit: true` triggers registration after successful submission
- Registration is idempotent: re-submitting or retrying never creates duplicate entries
- Ledger logic is in LedgerService, not in Module or RecordService

### Compatibility
- Existing modules are unaffected (null/undefined ledgerConfig)
- Future entitlement integration: `canUse("ledger")` may gate access
