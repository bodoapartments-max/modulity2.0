# ADR-0011 — Configurable Ledger Books & Universal Ledger Sources

## Status

Accepted — Step 17.1.1 (implemented, verified on `modulity-2-dev`).

## Context

Real UI acceptance testing exposed a product-model gap: a manually created
Ledger Book ("rooms", code ROOMS_LEDGER, 0/500 entries) sat on the Ledger main
page as an empty register, while official form submissions flowed into silent
per-Module auto books that were hard to discover/configure.

The architecture had conflated two responsibilities in one place:

- **Evidence preservation** — trusted registration of canonical Records
  (Step 16/17.1 invariants).
- **Visible organization** — the registers the workspace intentionally
  exposes and names.

`PRESERVATION != ORGANIZATION`. Creating a visible book must never be a
precondition for evidence surviving; a user should be able to decide months
later "I want a register of vehicle inspections" and organize existing
canonical evidence without inventing historical events.

## Decision

1. **One canonical `LedgerBook` model — no schema split.**
   The book remains the immutable sequence authority and the visible register.
   It gains two server-derived fields:
   - `sourceDefinition` — typed declarative evidence source
     (`{ type: 'MODULE', moduleId }`; closed union, validated, never arbitrary
     Firestore query configuration — see `ledgerSourceDefinition.js`).
   - `provisionedBy` — `'AUTO'` (server fallback) or `'USER'` (intentionally
     configured). Never a client claim: only the internal engine path may
     create AUTO books.

2. **Routing rule.** Trusted auto-registration (the `recordCommand` chain)
   resolves the register for a Module as: the USER-provisioned ACTIVE book
   whose source matches the Module, else the deterministic per-Module AUTO
   fallback book (created on demand, as before).

3. **Deterministic historical backfill.** When a USER book with a source is
   created, the trusted engine registers eligible historical evidence
   (canonical Records of that Module in status SUBMITTED/ACTIVE/COMPLETED,
   ordered by `_createdAt`, bounded paging ≤ 1000 records) through the ordinary
   `REGISTER_LEDGER_ENTRY` path with deterministic operation ids
   `backfill-{opId}-{recordId}`. Entries get fresh sequences in the NEW book;
   Record canonical data is not duplicated. Journal replay of the creation
   continues the backfill (idempotent — deterministic entry ids absorb retries).

4. **Users and future Automat/Agents create the SAME definition.** The
   `sourceDefinition` is a declarative, validated contract object; a future
   Agent can only propose it — validation and execution still flow through the
   trusted `ledgerCommand` boundary.

5. **Entities are NOT ledger sources.** ENTITY != RECORD != LEDGER ENTRY.
   Only official form submissions (canonical Records going through trusted
   lifecycle) are eligible evidence.

## Why not split into two collections

A separate "Evidence Register" + "Book Definition" pair would force either
duplicated numbering logic or cross-collection joins for every read, and would
break existing immutable entry ids (`le_{bookId}_{recordId}`) and references.
The single-model extension keeps every Step 16 guarantee intact: sequence
allocation, block rollover, deterministic entry identity, transaction-committed
audit, and Record↔Ledger linkage are byte-for-byte unchanged.

## Numbering/sequence preservation proof

- Entry id deterministic per (book, record) — unchanged.
- Sequence allocation happens inside the same transaction shape — unchanged.
- Voided entries stay consumed: `used = consumed − voided`,
  `remaining = endSequence − nextSequence + 1` — counters proven by unit tests
  and live E2E (void of 000002 → remaining stays 96, next entry takes 000005
  after 4 consumed).
- Backfill cannot double-consume: replay converges via journal + deterministic
  ids; 10× retry and "fresh opId on registered record" paths covered by tests.

## Backfill decisions (explicit)

- Eligibility: SUBMITTED/ACTIVE/COMPLETED Records of the source Module.
- Ordering: canonical `_createdAt` ascending.
- Timestamps: `_registeredAt` = server timestamp of registration (new), Record
  historical times untouched.
- Actors: `registeredBy` = the configuring user (honest attribution; no fake
  historical actors).
- Audit: each backfilled registration commits its own authoritative audit row
  with `operationId` `backfill-{op}-{recordId}`.
- Bounds: 100-record pages, max 10 pages per creation (1000 records); larger
  sources are a documented limitation — a continuation command can be added
  later without schema change.

## Security boundary

- Source references are re-validated server-side (Module must exist in the
  workspace) — Admin SDK bypasses Rules.
- Browsers cannot write books/entries/blocks (Rules unchanged since Step 16).
- Client payload keys controlling authority fields remain rejected; the closed
  source union cannot express arbitrary queries, collections, or operators.
- Contract version: `1.1.0` introduced; `1.0.0` still accepted (additive).

## Reset behavior

Unchanged contract: reset deletes records, ledgerBooks/blocks/entries/codes,
recordOperations — including configured books. The reset integration test
with a 105-entry register plus the live reset E2E section prove no ghost data.

## Compatibility

- Legacy books (no `sourceDefinition`/`provisionedBy`) remain valid manual
  registers; their rows render without the Auto badge.
- Auto books created before this change had no `provisionedBy` — they simply
  keep working; the AUTO fallback lookup addresses them by canonical id.

## Consequences

- Ledger main page = intentionally configured registers + auto evidence books.
- "Create the register months later" is now real: history organizes without
  fake events.
- New composite Firestore index: `ledgerBooks(moduleId, provisionedBy, status)`
  on DEV.

## Future

- RECORD_TYPE/recordType sources, book deactivation command, multi-Module
  books, and the Automat/Agent "propose a ledger" flow can extend the closed
  union without touching the evidence core.
