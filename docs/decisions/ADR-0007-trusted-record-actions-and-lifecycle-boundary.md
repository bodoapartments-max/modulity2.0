# ADR-0007 — Trusted Record Actions and Lifecycle Boundary

**Status:** Accepted (Step 15)
**Date:** 2026-10-03

## Context

Step 12 moved canonical Record creation behind the `recordCommand` callable.
Everything else about Records remained client-authoritative: DRAFT content
updates, draft submission (which was in fact impossible: Firestore Rules freeze
`submittedBy` for clients), priority, archive/restore, and cancel.

Step 15 needed a GENERIC, trusted substrate for Record lifecycle mutations —
the foundation on which later Approval, Workflow, Task and Scheduling
capabilities must compose.

## Decision

1. **One command boundary.** Existing `recordCommand` callable and the
   versioned shared contract (`recordCommandContract.js`, now `1.1.0`) were
   extended; no second mutation system was created. Legacy `1.0.0`
   CREATE clients remain compatible.
2. **Actions determine transitions.** A pure transition model
   (`recordLifecycle.js`) maps each command to its allowed source statuses and
   resulting status. Clients never send a target `status`. Payloads containing
   actor/identity/status/timestamp fields are rejected at envelope validation.
3. **Pure policy, server-authoritative.** `recordActionPolicy.js` evaluates
   `evaluateRecordAction({ actorContext, record, module, action })` with stable
   reason codes. The server applies it on every command; the UI uses the same
   pure function only to decide which buttons to display. UI visibility is
   never authorization.
4. **Atomic mutation + journal.** The operation journal entry and the Record
   mutation commit in ONE Firestore transaction. Same-`operationId` retries
   replay the journal result (checked before current-state policy); fresh
   operations re-evaluate the lifecycle against current state.
5. **Side effects are deterministic.** Audit entries (and the existing CREATE
   notification) write deterministic doc ids `op_<operationId>`, making
   retry/recovery idempotent without a distributed event system.
6. **Firestore Rules deny all client lifecycle/business mutations.** A narrow
   interim exception survives: Ledger linkage fields remain set-once-from-null
   until the Ledger backend moves server-side (Step 16).
7. **Scope guardrail.** Commands intentionally implemented:
   `UPDATE_DRAFT`, `SUBMIT_RECORD`, `SET_PRIORITY`, `ARCHIVE_RECORD`,
   `RESTORE_RECORD`, `CANCEL_RECORD`. Command names reserved but NOT
   implemented: `APPROVE_RECORD`, `REJECT_RECORD`, `ASSIGN_RECORD`,
   `COMPLETE_RECORD`. No generic business-action engine and no workflow DSL
   were created.

## Consequences

- Positive: `DRAFT → SUBMITTED` finally works and is server-owned; Rule-level
  client mutation attack surface is closed; Approval/Workflow have a stable
  substrate; browser impersonation of actors/timestamps is impossible.
- Negative/cost: every Record mutation requires a callable roundtrip; bulk
  operations iterate per-Record; the Ledger linkage exception and FormRequest
  completion path remain client-side until later milestones.

## Alternatives considered

- Keep client-side draft updates wrapped by Rules validation — rejected: Rules
  cannot reproduce schema validation or actor derivation.
- Introduce a generic "action engine" with configurable transitions — rejected:
  that is the future Workflow Engine; Step 15 must not build it.
- Allow `submitDraft` by relaxing the `submittedBy` immutability rule —
  rejected: weakens provenance instead of fixing the trust boundary.
