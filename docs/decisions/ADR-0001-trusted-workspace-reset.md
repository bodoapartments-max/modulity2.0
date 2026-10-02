# ADR-0001: Trusted Firebase Callable Boundary for Workspace Reset

- Status: Accepted
- Date: 2026-10-02

## Context

Workspace Reset must delete immutable and nested Workspace datasets while preserving User, Workspace, Organization, and Membership identity. Browser loops would be partial, non-portable, timeout-prone, and require weakening Firestore Rules. The repository previously had no trusted backend/Admin SDK boundary.

## Options considered

1. Browser-side deletion through client repositories — rejected for security, atomicity, portability, and Ledger/Audit integrity reasons.
2. Dedicated standalone API service — viable later, but disproportionate to the current Firebase architecture.
3. Minimal authenticated Firebase callable Cloud Function using Admin SDK — selected.
4. Defer reset — rejected because repeatable clean Workspace setup is required before later development testing.

## Decision

Implement a narrowly scoped `workspaceReset` callable in `europe-west1`. It verifies Firebase Auth, authorizes Personal owner or Organization OWNER, constructs an allowlisted ResetPlan, uses an Admin-only per-Workspace lock, performs recursive deletion, preserves identity/access, increments reset generation metadata, and writes a minimal platform-level reset audit outside the deleted dataset.

The callable implements only `WORKSPACE_DATA_RESET`. It is not a general-purpose admin/deletion API.

## Deployment status

Closed and deployment-verified on `modulity-2-dev`. The `workspaceReset` v2 callable runs in `europe-west1` on Node.js 22. Emulator validation and the authenticated disposable-Organization reset/reuse/browser journey passed.

## Consequences

- Normal client delete Rules remain unchanged.
- Firebase Functions/Admin SDK becomes a trusted deployment component.
- Reset contracts must explicitly include future collections.
- Functions dependencies currently carry a transitive moderate `uuid` advisory; the non-breaking compatible Firebase Admin/Functions versions do not yet eliminate it. Do not force an incompatible dependency upgrade.
- Binary storage cleanup and write-epoch enforcement remain future hardening.
- Deployment requires a Firebase project/plan capable of Cloud Functions.
