# Workspace Reset

## Purpose

`WORKSPACE_DATA_RESET` returns one selected Workspace to a usable initial data state without deleting the authenticated User, Workspace, Organization, or Memberships.

It is distinct from future `MODULE_DATA_RESET`, `FULL_WORKSPACE_DELETE`, and account deletion.

## Trusted boundary

```text
Authenticated client
→ Firebase callable workspaceReset
→ verified Firebase Auth UID
→ Personal owner / Organization OWNER authorization
→ deterministic allowlisted ResetPlan
→ Admin SDK recursive deletion
→ surviving platform reset audit
```

The browser never lists or deletes Workspace collections. Normal Firestore delete prohibitions for Records, Ledger, Audit, Messages, and other immutable resources remain unchanged.

## Reset contract

The allowlist is maintained in `functions/src/workspaceResetContract.js`. Adding a collection to the repository does not automatically make it resettable.

Reset resources:

- records
- DOMAIN Entity Types (CORE definitions survive)
- entities
- relationships
- file metadata
- modules and nested versions
- module code reservations
- deliveries
- form requests
- folders and nested items
- user Record state
- share tokens
- worksets
- WidgetDefinitions
- ReportDefinitions
- Notifications
- user Workspace preferences
- Conversations and nested Members/Messages
- Ledger Books and nested Blocks
- Ledger Entries and code reservations
- Workspace AuditEntries

No persisted ReportResult/WidgetResult collections exist.

## Preserved resources

- Firebase Auth User
- User profile
- Workspace document and identity
- Personal owner identity
- Organization document
- Organization Memberships and OWNER access
- CORE Entity Types

After success the Workspace document receives Admin-only `dataGeneration`, `lastResetAt`, and `lastResetBy` metadata.

## Authorization

- Personal Workspace: `ownerUserId` must equal authenticated UID.
- Organization Workspace: authenticated UID must have ACTIVE Membership containing OWNER.
- UI visibility is not authorization.

## Plan and confirmation

The client requests a ResetPlan before confirmation. The plan includes Workspace identity/type, authority, mode, allowlisted resources, preserved resources, and estimated top-level counts.

Execution requires the exact Workspace name and a unique request ID. The UI states are IDLE, PLANNING, CONFIRMING, RESETTING, SUCCESS, and ERROR.

## Idempotency and concurrency

A top-level Admin-only `workspaceResetOperations/{workspaceId}` lock prevents concurrent reset executions. A successful request ID is idempotent. Deleting already-missing documents is safe, so failed operations may be retried and converge on the same empty state.

The lock prevents concurrent resets, but current normal write paths do not yet reject writes made by other active clients during deletion. `dataGeneration` prepares stale-session detection; full write-epoch enforcement and realtime session invalidation are future hardening.

## Ledger exception

Trusted reset deletion is an explicit destructive administrative operation. It does not weaken ordinary Ledger/Audit Rules or expose browser delete permissions.

## Surviving audit

Minimal metadata is stored outside the reset dataset at `workspaceResetAudits/{auditId}`: Workspace identity/type, requester, execution time, mode, result, error code where relevant, and deleted top-level counts. Deleted business payloads are never copied into this audit.

## Cache/session behavior

After success the browser invalidates only cache keys prefixed by the current Workspace ID and reloads `/app`. Other Workspace caches remain untouched. Other active sessions converge on empty results when they query again; realtime forced session invalidation is deferred.

## Files and binary storage

Current V2 implements Firestore file metadata but no production binary deletion adapter in the reset backend. Reset removes metadata. If Firebase Storage binaries are introduced/used, their objects may remain orphaned until a trusted storage cleanup adapter is added. This is an explicit limitation.

## Deployment status

**CLOSED — DEPLOYMENT VERIFIED**

Verified deployment:

- Project: `modulity-2-dev`
- Function: `workspaceReset`
- Generation: v2 callable
- Region: `europe-west1`
- Runtime: Node.js 22
- Memory: 512 MiB

A disposable Organization Workspace (`Reset Test Hotel`) completed the authenticated destructive browser journey twice. The User, Organization, Workspace, Membership, OWNER access, and Personal Workspace survived. Canonical Workspace data and stale cache projections were removed. A new Module and canonical Record were created successfully between resets. Reset operation/audit documents settled to SUCCESS without business payload copies. Confirmation was usable at 375px and 768px.

Artifact Registry cleanup retains function images for 30 days. No client-side deletion fallback exists.

## Testing safety

Reset integration tests use the Firestore Emulator/Admin SDK. Never run destructive reset tests against production or shared development Workspace data. Browser smoke should use a dedicated disposable test Workspace.
