# Modulity 2.0 — Event Model

This document defines the event-driven foundation of Modulity 2.0. Events decouple producers from consumers and enable notifications, widgets, reports, agents and future automation.

---

## 1. Golden Rule

Core subsystems produce events. Consumers react to events.

The Core does not depend on consumers. Consumers depend on the event contract.

A full workflow engine is intentionally out of scope for Step 0.

---

## 2. Event Envelope

Every event has the following envelope:

```json
{
  "eventId": "evt:<uuid>",
  "eventType": "record.created",
  "schemaVersion": "1.0.0",
  "organizationId": "org:<uuid>",
  "workspaceId": "org:<uuid>",
  "timestamp": "2026-10-01T12:00:00.000Z",
  "correlationId": "corr:<uuid>",
  "causationId": "evt:<uuid-or-null>",
  "actor": {
    "type": "user",
    "id": "usr:<uuid>"
  },
  "payload": {/* event-specific data */},
  "metadata": {
    "clientVersion": "...",
    "source": "web"
  }
}
```

### Envelope Fields

- `eventId` — immutable unique event ID
- `eventType` — namespaced event type
- `schemaVersion` — version of the event schema
- `organizationId` — scope of the event
- `timestamp` — server-authoritative UTC timestamp
- `correlationId` — groups related events
- `causationId` — references the event that caused this one
- `actor` — user or service identity that triggered the event
- `payload` — event-specific data
- `metadata` — optional client/runtime metadata

---

## 3. Event Naming

Use dot-namespaced lowercase event types:

```
<domain>.<resource>.<action>
```

Examples:

- `record.created`
- `record.updated`
- `record.sent`
- `record.viewed`
- `record.submitted`
- `record.approved`
- `record.rejected`
- `record.cancelled`
- `record.archived`
- `entity.created`
- `entity.updated`
- `entity.deleted`
- `assignment.created`
- `assignment.changed`
- `assignment.removed`
- `membership.created`
- `membership.updated`
- `membership.removed`
- `ledger.book.opened`
- `ledger.book.closed`
- `ledger.sequence.allocated`
- `share.created`
- `share.revoked`
- `widget.updated`
- `report.generated`
- `notification.delivered`
- `entitlement.exceeded`

---

## 4. Core Event Types (v1)

### Record Events

| Event Type              | Payload Summary                                       |
| ----------------------- | ----------------------------------------------------- |
| `record.created`        | `recordId`, `moduleCode`, `creatorId`                 |
| `record.updated`        | `recordId`, `changedFields`, `oldValues`, `newValues` |
| `record.status.changed` | `recordId`, `oldStatus`, `newStatus`, `actorId`       |
| `record.sent`           | `recordId`, `recipientId`, `shareType`                |
| `record.viewed`         | `recordId`, `viewerId`                                |
| `record.submitted`      | `recordId`, `submitterId`                             |
| `record.approved`       | `recordId`, `approverId`                              |
| `record.rejected`       | `recordId`, `rejecterId`, `reason`                    |
| `record.cancelled`      | `recordId`, `reason`                                  |
| `record.archived`       | `recordId`                                            |

### Entity Events

| Event Type       | Payload Summary                       |
| ---------------- | ------------------------------------- |
| `entity.created` | `entityId`, `entityType`, `creatorId` |
| `entity.updated` | `entityId`, `changedFields`           |
| `entity.deleted` | `entityId`                            |

### Assignment Events

| Event Type           | Payload Summary                                        |
| -------------------- | ------------------------------------------------------ |
| `assignment.created` | `assignmentId`, `targetType`, `targetId`, `assigneeId` |
| `assignment.changed` | `assignmentId`, `oldAssigneeId`, `newAssigneeId`       |
| `assignment.removed` | `assignmentId`, `reason`                               |

### Ledger Events

| Event Type                  | Payload Summary                             |
| --------------------------- | ------------------------------------------- |
| `ledger.book.opened`        | `bookId`, `moduleCode`, `allocationSize`    |
| `ledger.book.closed`        | `bookId`, `lastSequenceNumber`              |
| `ledger.sequence.allocated` | `sequenceId`, `recordId`, `referenceNumber` |

### Membership & Workspace Events

| Event Type             | Payload Summary                                    |
| ---------------------- | -------------------------------------------------- |
| `membership.created`   | `membershipId`, `userId`, `organizationId`, `role` |
| `membership.updated`   | `membershipId`, `changedFields`                    |
| `membership.removed`   | `membershipId`, `reason`                           |
| `organization.created` | `organizationId`, `createdByUserId`                |

### Sharing Events

| Event Type      | Payload Summary                                  |
| --------------- | ------------------------------------------------ |
| `share.created` | `shareId`, `targetType`, `targetId`, `shareType` |
| `share.revoked` | `shareId`                                        |

---

## 5. Event Consumers

Consumers may include:

- Notifications
- Widgets
- Reports
- Agents
- Audit log
- Future Automations
- Webhooks
- Analytics

Consumers must:

- Validate the event envelope and schema version before processing.
- Be idempotent if they produce side effects.
- Handle unknown event types gracefully (ignore or log).

---

## 6. Event Bus

The event bus:

- Accepts events from Core subsystems.
- Persists events durably.
- Routes events to registered consumers.
- Supports replay within a retention window.

In early implementations the event bus may be synchronous within the same process. The contract remains the same for later distribution.

---

## 7. Idempotency & Ordering

- Event consumers should be idempotent.
- Ordering within a single `correlationId` is preserved when possible.
- Global ordering is not guaranteed across unrelated events.
- Causality is captured via `causationId`.

---

## 8. Schema Versioning

- Event schemas are versioned independently of module versions.
- Backward-compatible additions do not require a new major version.
- Breaking changes require a new event type or schema version and a migration strategy.

---

## Runtime Event Bus
- In-process, synchronous event delivery
- Used for reactive UI updates and service coordination
- Events: record.created, record.updated, record.submitted, record.cancelled, record.archived, etc.
- NOT the durable audit history

## Report/Widget Execution Events (Step 8)

Interactive Report and Dashboard Widget refreshes do not emit durable AuditEntries or Notifications by default, avoiding audit/event spam. ReportDefinition/WidgetDefinition persistence retains creator and server timestamp provenance. Future scheduled Reports/alerts may emit explicit domain Events and selective Notifications through a trusted dispatcher; scheduling is deferred.

## Chat Events (Step 7.2)

Chat persistence does not reuse the runtime Event Bus as storage. Conversation and Message documents are canonical. Step 7.2 does not emit notification-per-message or typing/read-receipt events; those remain deferred until a trusted collaboration dispatcher exists.

## Notification Layer (Step 7)

Notifications are selective, recipient-scoped, actionable UI messages. They are not a complete event stream and not an accountability log.

Initial mapping:

| Runtime Event | Notification |
|---|---|
| `record.sent` | `RECORD_SENT` for `recipientUserId` with canonical Record link |

The Notification Bridge is best-effort and intentionally ignores all unmapped events. Push/email delivery and durable retries are deferred.

## Durable Audit Layer (Step 6 + 6.1)
- AuditEntry: append-only persistence in Firestore
- Distinct from Event Bus runtime events
- Audit actions are validated against a controlled vocabulary
- Server-authoritative timestamps (`_timestamp` via Firestore `serverTimestamp()`)

## Audit Ownership Model (Step 6.1)

Each durable audit action has exactly **one owner** — either a business service or the AuditBridge. No action is written by both.

### LedgerService-owned audit (direct writes)
| Operation | Audit Action |
|---|---|
| Book creation | ledger.book_created |
| Entry registration | ledger.entry_registered |
| Entry cancellation | ledger.entry_cancelled |
| Entry voiding | ledger.entry_voided |
| Book close | ledger.book_closed |

### AuditBridge-owned audit (Event Bus mapping)
| Event Bus Event | Audit Action |
|---|---|
| record.created | record.created |
| record.submitted | record.submitted |
| record.cancelled | record.cancelled |
| record.archived | record.archived |
| record.unarchived | record.unarchived |
| record.priority_changed | record.priority_changed |
| record.sent | delivery.created |
| delivery.status_changed | delivery.{status} |

**Ledger events are intentionally excluded from AuditBridge** to prevent duplicate AuditEntries.

## Automat application (Step 9.2)

A successful trusted application writes one append-only `automat.plan.applied` AuditEntry and one recipient-scoped `AUTOMAT_PLAN_APPLIED` Notification. Resource-level results remain in the apply operation journal rather than producing event/notification spam for every Module. Agent provenance, plan lifecycle, operation journal, durable Audit, and Notification remain distinct.

The trusted Function does not reuse the in-memory browser Event Bus. A future distributed event dispatcher may emit `automat.plan.applied`; Step 9.2 does not claim durable Event Bus delivery. Unlike best-effort runtime audit bridges, completion of this privileged administrative operation requires its AuditEntry and external audit metadata; failure leaves the operation resumable rather than reporting APPLIED.

## Safety
- Audit persistence errors are caught and logged, never thrown into the Event Bus path or the LedgerService caller
- This prevents audit failures from breaking primary business operations
- **Limitation**: audit writes are best-effort. If a business operation succeeds but audit persistence fails, the audit entry is lost. Full guaranteed audit requires a Cloud Function (future)
