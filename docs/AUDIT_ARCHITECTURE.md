# Audit Architecture (Step 16)

Audit answers: **what happened, who caused it, when, to which canonical
object.**

Auditable evidence is immutable business fact. Only trusted server boundaries
may author it.

## Canonical event contract

Existing model, formalized as authoritative in Step 16
(`src/core/audit/auditEntry.js` — `createAuditEntry`):

```text
auditEntryId   — deterministic: op_{operationId}_{action}
workspaceId
actor          — ActorRef, SERVER-DERIVED from request.auth.uid
action         — controlled vocabulary (auditActions.js)
resourceType   — RECORD / MODULE / ENTITY / LEDGER_BOOK / LEDGER_ENTRY / ...
resourceId
timestamp      — writer ISO; _timestamp is ALWAYS a Firestore serverTimestamp
metadata       — minimal references (moduleId, moduleVersion, operationId, …)
correlationId  — op:{operationId}
source
```

**Never** in the payload: full Record/Entity documents, user profile data, or
browser-supplied identity/timestamps.

## Trusted producers

| Producer | Boundary | Events |
|---|---|---|
| `recordCommand` | Cloud Function | `record.created`, `record.submitted`, `record.draft_updated`, `record.priority_changed`, `record.archived`, `record.unarchived`, `record.cancelled` |
| `ledgerCommand` | Cloud Function | `ledger.book_created`, `ledger.entry_registered` (RECORD-scoped: subject is the Record; metadata carries entry/reference) |
| `automatApply` | Cloud Function | `automat.plan.applied` |
| `workspaceReset` | Cloud Function | reset evidence docs (`workspaceResetAudits` — separate top-level evidence, already server-only) |

### Retired producer (Step 16)

The browser **AuditBridge** (`src/core/audit/auditBridge.js`) used to persist
Event-Bus events into `auditEntries` from the client. It was removed from
`bootstrapServices` and deleted. Browser telemetry must never masquerade as
canonical Audit. Record History for client-side-only flows (deliveries,
FormRequests) has no durable Audit rows until those domains get trusted
commands — that is a documented gap, not silently unverified evidence.

## Idempotency and atomicity

- Audit docs are written at deterministic ids `op_{operationId}_{action}` —
  retry of a trusted operation overwrites rather than duplicates. Because the
  journal replays before the mutation on retry, the entry is written exactly
  once per logical operation.
- The Audit entry commits in the SAME Firestore transaction as the canonical
  mutation and the operation journal completion — a trusted mutation cannot
  commit without its authoritative evidence.
- Distinct event kinds from one operation use the `{action}` suffix in the
  deterministic id (one operation may legitimately emit more than one event).

## History projection

Record History (`src/features/records/ui/RecordHistory.jsx`) reads durable
Audit entries through `auditEntryRepo.paginatedQuery` (bounded, ordered by the
server `_timestamp`). History never reconstructs activity from current Record
state and never reads the in-memory Event Bus.

## Firestore Rules

Browsers may:
- `read` Audit entries within their workspace (unchanged).

Browsers may not:
- `create`, `update`, or `delete` Audit entries (Step 16 — server-only).

The Admin SDK bypasses Rules, so every trusted function performs explicit
authorization itself.

## Relationship to the operation journal

- `recordOperations` = execution/idempotency/recovery evidence (server-only).
- `auditEntries` = business/security history.
- The journal is never duplicated into Audit, and Audit is not the journal.

## Known limitations (Step 16 truth)

- Entity/Module/Sharing/Delivery mutations remain client-authoritative for
  their canonical data and currently produce no durable Audit evidence since
  the browser bridge was retired. Their trusted migration is deliberately
  deferred (each needs its own trusted command step).
- Retention/administrative deletion policy is out of scope (Workspace Reset
  semantics unchanged — reset wipes the workspace's audit entries by design).
