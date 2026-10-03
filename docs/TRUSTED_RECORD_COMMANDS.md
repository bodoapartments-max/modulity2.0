# Trusted Record Commands

## Purpose

This document describes the server-authoritative command boundary for canonical
Record lifecycle operations introduced in Step 12.

The trusted command boundary is the single place where user-facing clients can
create canonical Records. It replaces the previous client-side direct Firestore
Record creation path with a verified, validated, idempotent server path.

## Scope

Step 12 implements only `CREATE_RECORD`. The contract envelope is designed to
support future commands without changing the architecture:

- `CREATE_RECORD` (implemented)
- `UPDATE_RECORD` (future)
- `SUBMIT_RECORD` (future)
- `ASSIGN_RECORD` (future)
- `APPROVE_RECORD` (future)
- `REJECT_RECORD` (future)
- `COMPLETE_RECORD` (future)
- `CANCEL_RECORD` (future)
- `ARCHIVE_RECORD` (future)
- `RESTORE_RECORD` (future)

## Command contract

```js
{
  contractVersion: "1.0.0",
  operationId: "<stable-idempotency-key>",
  commandType: "CREATE_RECORD",
  payload: {
    workspaceId: "<workspace-id>",
    moduleId: "<module-id>",
    values: { /* FormSchema values */ },
    isDraft: false,
  }
}
```

- `contractVersion` is mandatory and must match `RECORD_COMMAND_CONTRACT_VERSION`.
- `operationId` is a stable idempotency key provided by the caller.
- `commandType` must be a known command type.
- `payload.values` contains the user-entered business data validated against the
  Module's FormSchema.

## Trust boundary

The following facts are resolved server-side from canonical Workspace data:

- Authenticated Firebase Auth identity (`request.auth.uid`).
- Workspace existence and caller authorization (Personal owner / active Organization member).
- Module existence, workspace ownership, and status (`ACTIVE` or `DRAFT`).
- Canonical Module Version and historical FormSchema snapshot.
- EntityReference existence, workspace match, and Entity Type match.

The server rejects or overrides client claims for:

- `createdBy`, `submittedBy`, `workspaceId`, `moduleId`, `moduleVersion`, `recordType`
- `createdAt`, `updatedAt`, `recordId`

## Idempotency

Each command carries an `operationId`. The server maintains a lightweight
operation journal at `workspaces/{workspaceId}/recordOperations/{operationId}`.

- First call creates an operation entry, writes the canonical Record, and marks the
  operation `COMPLETED` with the resulting `recordId`.
- Retry with the same `operationId` returns the previously created Record.
- Concurrent duplicate calls are serialized by Firestore transactions: exactly one
  canonical Record is created.

Two calls with different `operationId` values and identical business payloads are
intentionally two distinct Records.

## Transaction boundary

The critical path is one Firestore transaction:

1. Validate the command envelope.
2. Read/verify workspace authorization, module, module version snapshot, and entity
   references.
3. Read the operation journal entry.
4. If not completed, create the operation entry (`PROCESSING`), create the Record
   document with a deterministic `recordId`, and update the operation entry to
   `COMPLETED`.

Audit and notification side effects run after the transaction and are best-effort.
They do not roll back an otherwise valid Record.

## Callable function

- **Name:** `recordCommand`
- **Region:** `europe-west1`
- **Runtime:** Firebase Functions v2, 512 MiB, 60 s timeout
- **Entry:** `functions/src/index.js`
- **Implementation:** `functions/src/recordCommandEngine.js`

## Client adapter

Feature UI does not call Firebase Functions directly. The adapter is:

```text
src/infrastructure/firebase/recordCommandClient.js
```

Usage through the existing service layer:

```text
Module Form
  ↓
ModuleSubmissionService
  ↓
recordCommand.submit({ workspaceId, moduleId, actor, values, isDraft })
  ↓
recordCommandClient.execute(command)
  ↓
Firebase callable: recordCommand
```

## Firestore Rules

Direct browser `CREATE` on `workspaces/{workspaceId}/records/{recordId}` is
denied. Records are created by the trusted callable running with Admin SDK
privileges.

`UPDATE` and `DELETE` rules are unchanged in Step 12; only submission/creation
is moved behind the trusted boundary.

## Failure behavior

- Validation failures return deterministic error codes such as
  `WORKSPACE_FORBIDDEN`, `MODULE_NOT_FOUND`, `SCHEMA_INVALID`,
  `ENTITY_REFERENCE_INVALID`, `UNSUPPORTED_CONTRACT_VERSION`, etc.
- If the operation journal shows `PROCESSING` when a duplicate arrives, the
  duplicate receives `OPERATION_CONFLICT`.
- Best-effort Audit/Notification failures are logged and do not invalidate the
  Record.

## Testing

- Unit tests: `src/core/recordCommands/*.test.js`
- Integration tests: `tests/rules/recordCommand.integration.test.js`
- Security tests: direct Record `CREATE` is proven denied in
  `tests/rules/firestore.rules.test.js`.

## Migration

- Existing historical Records remain valid and readable.
- The Module Form UI continues to use `ModuleSubmissionService`.
- In production `services.js` injects the trusted `recordCommand` adapter.
- Tests and fallback scenarios can use `createRecordCommandLocalAdapter`.
