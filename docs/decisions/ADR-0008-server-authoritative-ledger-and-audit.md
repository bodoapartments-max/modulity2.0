# ADR-0008 — Server-Authoritative Ledger and Audit Evidence

**Status:** Accepted (Step 16)
**Date:** 2026-10-03

## Context

Ledger entries (immutable numbered registrations) and Audit entries
(accountability evidence) were historically writable from the browser under
Firestore Rules that could only approximate semantics: rules can validate
shape and membership, but cannot compute sequences, resolve contention, or
prove actor/time provenance. Step 15 closed this for Record lifecycle;
Ledger/Audit stayed partly client-authoritative and the legacy browser
AuditBridge could produce authoritative-looking evidence from untrusted
client events.

The Step 14→16 local ledger concurrency suite was also flaky under emulator
load because browser-SDK transactions had to bold-face contention on the
sequence block document with limited retry budgets.

## Decision

1. **Ledger registration and sequence allocation are server-authoritative.**
   A versioned `ledgerCommand` callable hosts `CREATE_LEDGER_BOOK` and
   `REGISTER_LEDGER_ENTRY`. Sequence, reference, actor, timestamps, block
   rollover, and Record linkage are server-derived. Clients send only intent
   (`recordId`, `ledgerBookId`, book configuration) plus an `operationId`.
2. **The Firestore transaction is the atomic unit.** One transaction commits:
   journal completion, Ledger entry, block update, Record linkage, and the
   authoritative Audit entry. Reads-before-writes ordering is mandatory in
   Firestore transactions; the journal `COMPLETED` write must never precede
   a validation read.
3. **Audit evidence is server-only.** Browser create/update/delete on
   `auditEntries` is denied by Rules. The legacy client AuditBridge was
   retired. Audit document ids are deterministic (`op_{operationId}_{action}`)
   so trusted-operation retries cannot duplicate logical history.
4. **Browser mutation denial where evidence lives:** browsers cannot create
   or mutate Ledger entries, blocks, books, or code reservations, nor set
   Record Ledger linkage. Reads are preserved unchanged.
5. **Flaky-by-design removed.** The old browser transaction race pattern is
   replaced by a server transaction with `maxAttempts: 50`; concurrency
   invariants are proven via Admin SDK against the emulator
   (20 same-record registrations converge; 50 distinct registrations yield
   unique contiguous sequences with rollover).
6. **Not built:** Workflow/Approval engines, cancel/void trusted commands
   (no UI consumed them — deferred), FormRequest trusted completion
   (deliberately deferred — needs its own recipient-scoped command),
   administrative retention policy.

## Consequences

- Numbering tamper, ledger forgery and audit impersonation become impossible
  from browsers.
- Historical audit entries written before Step 16 carry inconsistent
  `_timestamp` fields (the historical query orders by it); they remain in
  place as data, but post-Step-16 writes populate `_timestamp` correctly.
  History rendering for pre-migration entries may be incomplete in DEV.
- Every trusted mutation pays one transaction; ledger registration is a
  hotspot transaction by design (documented, covered by concurrency tests).

## Alternatives considered

- Keep Rules-mediated client ledger transactions — rejected: Rules cannot
  allocate sequences, derive actors, or tolerate contention deterministically.
- Introduce a generic event-sourcing layer — rejected: out of scope, no
  product need; the operation journal + audit entries already provide the
  required guarantees.
