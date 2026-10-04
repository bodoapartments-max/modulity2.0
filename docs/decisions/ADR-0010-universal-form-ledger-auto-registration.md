# ADR-0010 — Universal Form Ledger: Auto-Registration and Historical Form Viewer

## Status

Accepted — Step 17.1 (implemented, verified on `modulity-2-dev`).

## Context

V1 Modulity maintained a universal per-form register: every submitted form was
registered in a numbered book, cancellations were crossed out instead of
erased, and any historical registration could be opened read-only with
Previous/Next navigation. Step 16 built the trusted server Ledger backend but
attached a Record to the Ledger only when a user explicitly registered it.

This left a gap: official submissions existed without register identity, and
users had no historical form viewer. Fully client-driven registration would
violate the trusted-command boundary established in Step 15/16.

## Decision

1. **Server-side auto-registration.** The trusted Record command engine
   (`functions/src/recordCommandEngine.js`) chains a Ledger registration after
   a successful `SUBMIT_RECORD` (and non-draft `CREATE_RECORD`) mutation. The
   per-Module Form Book is auto-provisioned on demand
   (`ensureModuleLedgerBook`), then the Record is registered through the
   existing `ledgerCommand` path with deterministic operation id
   `auto-register-{operationId}`. The Record mutation and the registration are
   deliberately two sequential trusted operations: the Record stays canonical
   even if registration fails (logged, non-blocking), while operation-id
   determinism makes retries converge to exactly one entry.

2. **Cancellation is evidence, not erasure.** A trusted `CANCEL_RECORD` chains
   `cancelLedgerRegistrationForRecord`, flipping the Record's entries to
   CANCELLED with `cancelledAt`/`cancelledBy`/`cancellationReason`. Entries are
   never deleted; the sequence is never reused.

3. **Browser remains a projection.** The Form Books list, Book page (block
   strip + filters) and the read-only Historical Form Viewer only read Ledger
   data. The viewer renders the Record with the exact historical Module Version
   schema (via `FormRenderer` read-only mode) — the Step 4.1 invariant applied
   to register inspection.

4. **Reset completeness.** `recordOperations` joined the workspace reset
   contract; no trusted journal may outlive a reset as ghost data.

## Consequences

- Every official Module submission automatically receives a durable,
  human-readable register identity with zero user action.
- Drafts consume no sequence numbers.
- A composite index `(ledgerBookId, ledgerBlockId, sequenceNumber)` on
  `ledgerEntries` is required and deployed.
- Retried submissions and retry storms cannot duplicate registrations (journal
  + deterministic entry id + transaction-internal idempotency).
- Live E2E (`tests/e2e/step17_1.e2e.spec.js`) covers: submit → auto-register →
  counters → read-only viewer with Prev/Next → cancel keeps crossed-out
  history → workspace reset leaves no ghost entries and numbering restarts.

## Alternatives considered

- **Single mega-transaction** (Record mutation + registration in one txn):
  rejected — it would make Record submissions depend on Ledger availability
  and complicate journal semantics. The chained deterministic operation keeps
  canonical Record truth independent.
- **Feature-specific registers** (per-module bespoke implementations):
  rejected — one generic Ledger for all Modules preserves the "CORE owns
  truth" architecture.
