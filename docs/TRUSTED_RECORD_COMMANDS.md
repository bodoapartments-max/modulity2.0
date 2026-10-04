# Trusted Record Commands

## Purpose

The trusted command boundary is the single place where clients create and
mutate canonical Records. Step 12 established `CREATE_RECORD`; Step 15
extended the same boundary to the generic Record lifecycle mutations.

A Record action is a trusted domain command, not a UI button:

```
USER INTENT → Generic Record Command → Trusted Server Authorization
  → Load Canonical Record + Action Policy → Valid Transition
  → Canonical Record Mutation → Audit → Result
```

## Scope

Implemented commands (contract version `1.1.0`):

| Command | Purpose | Payload (beyond workspaceId) |
|---|---|---|
| `CREATE_RECORD` | Trusted creation (draft or submitted) | `moduleId`, `values`, `isDraft` |
| `UPDATE_DRAFT` | Trusted DRAFT content update | `recordId`, `values` |
| `SUBMIT_RECORD` | Trusted DRAFT → SUBMITTED transition | `recordId` |
| `SET_PRIORITY` | Trusted priority change | `recordId`, `priority \| null` |
| `ARCHIVE_RECORD` | Trusted archive (writes `_previousStatus`, `archivedAt/By`) | `recordId` |
| `RESTORE_RECORD` | Trusted unarchive (restores pre-archive status) | `recordId` |
| `CANCEL_RECORD` | Trusted cancellation | `recordId` |

Reserved but NOT implemented: `APPROVE_RECORD`, `REJECT_RECORD`,
`ASSIGN_RECORD`, `COMPLETE_RECORD`, `UPDATE_RECORD`. Approval/Workflow engines
compose on this substrate in later milestones; they do not exist yet.

Contract versions accepted by the server: `1.0.0` (legacy CREATE clients) and
`1.1.0`. Old clients sending `1.0.0` CREATE_RECORD commands keep working.

## Command contract

```js
{
  contractVersion: "1.1.0",
  operationId: "<stable=idempotency-key>",
  commandType: "SUBMIT_RECORD",
  payload: { workspaceId: "…", recordId: "…" }
}
```

Strictly rejected from payloads (server-authoritative facts):
`actor`, `actorId`, `userId`, `createdBy`, `submittedBy`, `updatedBy`,
`createdAt`, `updatedAt`, `submittedAt`, `status`, `statusTarget`.

The server derives the actor from `request.auth.uid`, loads the canonical
Record, applies the Record Action Policy, validates the transition, and only
then mutates.

## Record Action Policy

Pure deterministic gate (`src/core/recordCommands/recordActionPolicy.js`):

```
evaluateRecordAction({ actorContext, record, module, action })
  → { allowed, reasonCode }
```

- Firebase access is NOT in the policy; callers load state first.
- Reason codes are stable machine-readable strings:
  `UNAUTHENTICATED`, `WORKSPACE_FORBIDDEN`, `RECORD_NOT_FOUND`,
  `MODULE_NOT_FOUND`, `MODULE_NOT_ACTIVE`, `INVALID_RECORD_STATE`,
  `UNSUPPORTED_COMMAND`, `ACTION_NOT_ALLOWED`, `RECORD_INVALID`,
  `OPERATION_MISMATCH`, `OPERATION_IN_PROGRESS`, …
- UI uses the same pure function to decide which action buttons to **show**.
  UI visibility is never authorization.

## Lifecycle transition model

`src/core/recordCommands/recordLifecycle.js` is the single transition table:

| Command | From | To |
|---|---|---|
| `UPDATE_DRAFT` | DRAFT | (status unchanged; data replaced) |
| `SUBMIT_RECORD` | DRAFT | SUBMITTED |
| `SET_PRIORITY` | DRAFT/SUBMITTED/ACTIVE/COMPLETED | (unchanged; priority set) |
| `ARCHIVE_RECORD` | any | ARCHIVED (idempotent no-op if already archived) |
| `RESTORE_RECORD` | ARCHIVED | `_previousStatus` (fallback ACTIVE) |
| `CANCEL_RECORD` | DRAFT/SUBMITTED/ACTIVE/COMPLETED | CANCELLED |

The client never selects a target status; the command implies the transition.
Unknown/reserved commands are rejected with `UNSUPPORTED_COMMAND`.

## UPDATE_DRAFT semantics

- Only DRAFT Records. Everything else is rejected with `INVALID_RECORD_STATE`.
- Validation uses the Record's **historical Module Version** schema
  (`record.moduleId` + `record.moduleVersion` snapshot), never just the
  current Module schema.
- Draft updates are intentionally partial: supplied values are type-checked;
  required-field enforcement is deferred to `SUBMIT_RECORD`. Undeclared
  fields are rejected.
- EntityReferences extracted from values are structurally validated, then
  resolved server-side (existence, workspace, Entity Type) before mutation.
- Autosave UX (`RecordEditPage`) sends one `UPDATE_DRAFT` per save with a
  fresh `operationId`; a retry of an identical failed payload reuses the
  same `operationId`, so the server replays the operation idempotently.

## SUBMIT_RECORD semantics

- Preconditions: authenticated user, workspace authorization, Record exists
  and is DRAFT, source Module exists and is ACTIVE, stored `data` passes the
  FULL historical FormSchema validation (required fields enforced), all stored
  EntityReferences still resolve.
- The server sets `status=SUBMITTED`, `submittedBy=<verified uid>`,
  `submittedAt=<server ISO>`. None of these are accepted from the client.
- Double-submit safety: the same `operationId` replays the journal result;
  a fresh `operationId` against an already-submitted Record is rejected as
  `INVALID_RECORD_STATE`. One Record, one transition.

## Operation journal and recovery

Shared journal: `workspaces/{workspaceId}/recordOperations/{operationId}`
(remains server-only in Firestore Rules).

- Fingerprint = SHA-256 of `stableJson({ userId, commandType, payload })`.
  Same `operationId` + different command → `OPERATION_MISMATCH`.
- Leases: `PROCESSING` entries expire (`leaseExpiresAt`); stale entries are
  reacquired with bounded `attemptCount`; `OPERATION_IN_PROGRESS` while the
  lease is valid; `FAILED` is terminal; `COMPLETED` replays.
- **Mutation crash safety:** for mutations, the journal `COMPLETED` write and
  the Record mutation commit in ONE Firestore transaction. There is no window
  where the journal says done but the Record did not change.
- Journal replay is evaluated BEFORE the current-state policy so a retried
  legitimate operation is never misjudged as an invalid transition.

## Audit / side effects (updated in Step 16)

- Every trusted mutation writes its authoritative Audit entry using the
  canonical `createAuditEntry` model with the matching action
  (`record.submitted`, `record.draft_updated`, `record.archived`,
  `record.unarchived`, `record.priority_changed`, `record.cancelled`,
  `record.created`).
- The Audit entry commits in the **SAME Firestore transaction** as the
  canonical mutation and journal completion — a trusted mutation cannot
  commit without its evidence.
- Audit document ids are deterministic: `op_{operationId}_{action}`. Journal
  replay returns before the mutation, so history is written exactly once.
  `_timestamp` is a Firestore `serverTimestamp` (that is what the History
  query orders by).
- The CREATE_notification path runs through the generic notification
  architecture (`functions/src/notificationEngine.js`): deterministic id
  `op_{operationId}_{eventType}_{recipientUserId}` — retries cannot
  duplicate an inbox item; notification failure never invalidates a
  committed mutation. Generic notification policy lives in
  Step 17's `docs/NOTIFICATION_ARCHITECTURE.md`.
- The legacy browser AuditBridge was removed; browsers author no Audit.

See `docs/AUDIT_ARCHITECTURE.md` and ADR-0008.

## Firestore Rules (Step 15 tightening)

Browser clients may no longer mutate any business/lifecycle Record field:
`data`, `entityReferences`, `entityReferenceIds`, `status`, `priority`,
`_previousStatus`, `archivedAt`, `archivedBy`, `submittedAt`, `attachments`,
`createdEntityIds` are all immutable to clients regardless of Record status.

Documented interim exception: Ledger linkage (`ledgerEntryId`, `ledgerBookId`,
`referenceNumber`) remains set-once-from-null for the existing client Ledger
registration flow. Step 16 moves the Ledger backend server-side; the exception
is revisited then. Record reads and deletion-denial semantics are unchanged.

## Callable function

- **Name:** `recordCommand`, **Region:** `europe-west1`
- **Implementation:** `functions/src/recordCommandEngine.js`
  (`executeRecordCommand` dispatches CREATE vs mutation paths)
- Shared contract/engine/policy/lifecycle are copied from `src/core/…` into
  `functions/src/generated/` by `functions/scripts/build-shared.mjs`.

## Client adapter

Feature code calls the service-layer facade only:

```text
services.recordCommand.submit({ workspaceId, moduleId, values, isDraft, operationId? })
services.recordCommand.updateDraft({ workspaceId, recordId, values, operationId? })
services.recordCommand.submitRecord({ workspaceId, recordId, operationId? })
services.recordCommand.setPriority / archiveRecord / restoreRecord / cancelRecord(...)
```

`ModuleSubmissionService.submitDraft` delegates to trusted `SUBMIT_RECORD`
when the command boundary is wired, which is the configuration in production.
The legacy client path remains only for offline unit tests.

## Testing

- Policy/lifecycle/contract: `src/core/recordCommands/*.test.js`
- Server executor incl. mutation idempotency + 10× concurrency:
  `functions/src/recordCommandEngine.test.js`
- Rules (client mutation denials + legitimate reads):
  `tests/rules/firestore.rules.test.js`
- Live browser: `tests/e2e/step15.e2e.spec.js` (draft autosave, rejected then
  successful submit, archive/restore, zero direct browser mutations).

## Migration / compatibility

- Historical Records are untouched and remain readable.
- Modules created before Step 15 work unchanged; old `1.0.0` CREATE clients
  are accepted by the deployed server.
