# Step 31 — Approval Engine & Action Cards

Canonical, generic controlled-decision capability. ONE approval
architecture for the whole platform — no per-domain engines (no
`expenseApprovals`, `holidayApprovals`, …).

```
REQUEST / PROPOSAL → ApprovalCase → ApprovalStep(s)
  → assigned decision maker(s) → Decision → AUTHORIZED OUTCOME
  → trusted action
```

Approval **authorizes**; it never mutates business truth itself. When the
final step approves, the embedded closed action re-enters the canonical
trusted command boundary.

## Canonical model

| Document | Path | Purpose |
|---|---|---|
| `ApprovalDefinition` | `workspaces/{ws}/approvalDefinitions/{id}` | Reusable versioned approval configuration (`apdef_`). Steps, quorum, self-approval policy, default expiry. |
| `ApprovalCase` | `workspaces/{ws}/approvalCases/{id}` | One controlled decision process (`appr_`). Contains pinned step snapshots, append-only `decisions[]`, `proposedAction`, `proposalFingerprint`, `execution` marker. |
| `ActionCard` | `workspaces/{ws}/actionCards/{id}` | Derived operational projection (`ac_`) — "things awaiting me". Never a second source of truth. |

### ApprovalCase fields

- `approvalCaseId` — deterministic `appr_{operationId}` (creation is idempotent)
- `requestType` — closed registry: `TRUSTED_COMMAND` (active), `AGENT_PROPOSAL` (reserved)
- `subject` — closed typed reference `{type: RECORD|ENTITY|FILE|NONE, id, revision}` — never arbitrary paths
- `proposedAction` — closed registry: `RECORD_COMMAND` wraps a trusted command envelope **without** operationId/workspaceId (server assigns both)
- `proposalFingerprint` — sha256 over canonical material (requestType + subject + revision + proposedAction)
- `steps[]` — pinned snapshots `{stepIndex, name, quorum, status, assignments[]}`
- `decisions[]` — append-only immutable evidence `{decisionId, stepIndex, decidedBy, decision, reason, decidedAt}`
- `selfApprovalPolicy` — `FORBID` (default) / `ALLOW`
- `execution` — `PENDING_EXECUTION | EXECUTED | NOT_REQUIRED` + `resultResourcePath`
- `status` — `PENDING | APPROVED | REJECTED | CANCELLED | EXPIRED` (terminal states explicit; a resolved case never returns to PENDING)

## Lifecycle

- `PENDING` is the only non-terminal state; `currentStepIndex` carries progression.
- `ANY_ONE` resolves a step on the first decision (other assignees `SKIPPED`); `ALL` requires every assignee to approve — any `REJECT` resolves the case `REJECTED` immediately. `QUORUM(n)` is a documented extension seam, not implemented.
- Reserved decision kinds `REQUEST_CHANGES / RETURN / DELEGATE` are seams — a materially changed proposal produces a NEW case, never silent approval reuse.
- Expiry is deterministic lazy detection: a `PENDING` case past `expiresAt` resolves `EXPIRED` at decision time — no background sweeper required (auto-sweep deferred to Scheduling/Workflow).
- Cancellation: requester or personal-workspace owner, pending cases only, evidence preserved.

## Policy integration (Step 24)

- `AUTO_EXECUTE` → execute through the canonical trusted action (unchanged).
- `APPROVAL_REQUIRED` → no protected mutation; the caller opens an `ApprovalCase` carrying the intended command as `proposedAction`. Gateway operations surface `GATEWAY_ERROR_CODES.APPROVAL_REQUIRED`.
- `DENY` → no mutation, no approval bypass.
- `resolveApprovalRequirement()` is the pure seam mapping ACTIVE `ApprovalDefinition`s to the requirement decision.
- Approver authority is re-checked **at decision time**: active workspace/org membership is re-evaluated inside the decision transaction — assignment is not permanent authorization (temporal grants respected).

## Stale-state protection

- `subject.revision` is captured at case creation (`FILE` → `v{currentVersion}`; `RECORD`/`ENTITY` → `u{updatedAt}`) and re-verified in-transaction at decision time → `PROPOSAL_STALE`.
- Approving `Contract.pdf` v3 never implies v4.
- The executed payload is the case's immutable `proposedAction` — never a client-supplied payload at decision time.

## Trusted execution path

`approvalCommand` callable (`functions/src/approvalCommandEngine.js`):

1. validate envelope → server-authoritative fields rejected
2. workspace authorization (personal owner / active org member)
3. operation journal (`recordOperations`) — replay/mismatch/in-progress semantics identical to `recordCommand`/`fileCommand`
4. ONE Firestore transaction — case/decision patch + journal COMPLETED + BusinessEvent + AuditEntry + ActionCard writes
5. post-commit: canonical notifications (best-effort — delivery failure never corrupts the commit)
6. on final approval: `dispatchEmbeddedAction` re-enters the closed executor registry (`RECORD_COMMAND → executeRecordCommand`) under deterministic `exec_{createOperationId}` — the embedded engine's own journal guarantees **exactly-once**; a DECIDE replay converges via `resumeApprovedExecution` if the execution marker never landed.

Commands: `CREATE_APPROVAL_DEFINITION`, `UPDATE_APPROVAL_DEFINITION`,
`CREATE_APPROVAL`, `DECIDE_APPROVAL`, `CANCEL_APPROVAL`.

## Action Cards

- Generic operational projection (`src/core/actionCards/`): type registry reserves `TASK / DOCUMENT_MISSING / SCHEDULING_CONFLICT / COMPLIANCE / AGENT_PROPOSAL / RECONCILIATION_ISSUE`.
- `actions[]` is a CLOSED registry: `APPROVAL_DECIDE {decision, approvalCaseId}`, `VIEW_SUBJECT` (navigation-only). No executable code, URLs or mutation names.
- Cards open per assignee on case creation / step advance and close when the step resolves or the case resolves/cancels/expires.
- UI: `src/features/actionCards/` — reusable `ActionCard` + minimal `ActionCardsPage` at `/app/action-cards` (loading/empty/error/busy states; one operationId per user intent → double-click safe). The full Action Inbox is Step 42.

## Events, audit, notifications

- BusinessEvents: `approval.requested / step_completed / approved / rejected / cancelled / expired` (`approvalCommand` source, deterministic event ids — no duplicates on retry).
- Audit: `approval_definition.created/updated`, `approval.requested/decided/approved/rejected/cancelled/expired/executed` on `APPROVAL_CASE`/`APPROVAL_DEFINITION` resources.
- Notifications: canonical engine only — `approval.requested` → assignees, `approval.resolved` → requester; deterministic notification ids dedupe retries.

## Security

- Approvers must be ACTIVE workspace/org members — validated at creation AND re-checked at decision time.
- Self-approval denied under `FORBID` both at creation (requester can't self-assign) and at decision time.
- Firestore Rules: all three collections are member-readable, `create/update/delete: if false` — server-authored only.
- All protected fields (actor, ids, status, decisions, fingerprint, timestamps) are server-derived; client-supplied values are contract violations.

## Capability / Gateway

- Capability `approval` (`AVAILABLE`, ACTION): requires `policy-authority`, `business-event`; optional `notification`, `file`.
- Gateway: `approval.get / list / create / decide / cancel` — closed operations, policy-checked, idempotencyKey → journal operationId. No arbitrary approval mutation or action execution.

## Deferred

- QUORUM(n), REQUEST_CHANGES/RETURN/DELEGATE decision kinds.
- Auto-expiry sweeper (needs Scheduling/Workflow — Step 33/32).
- `AGENT_PROPOSAL` requestType activation (Agent Runtime seam — Step 27+ surface).
- Signature integration (design-compatible only — APPROVED ≠ SIGNED).
- Definition version history documents (current version + pinned case snapshots are sufficient today).
- Organization-admin cancellation role (requester + personal owner only today).
- Action Inbox UX (Step 42).
