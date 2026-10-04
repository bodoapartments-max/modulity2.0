# Ledger Architecture (Step 16)

The Ledger assigns durable, immutable, numbered register identity to canonical
Records. Browsers project Ledger data; only trusted servers author it.

## Domain model

- **LedgerBook** (`workspaces/{ws}/ledgerBooks/{id}`) — a numbered register:
  `ledgerCode` (unique per workspace, immutable), `name`, optional Module /
  recordType scope, `blockSize`, `referencePrefix`, `referenceFormatVersion`,
  `currentBlockId`.
- **LedgerBlock** (`ledgerBooks/{bookId}/blocks/{blockId}`) — a fixed-capacity
  slice of the sequence (`blockNumber`, `startSequence`, `endSequence`,
  `nextSequence`, `status` OPEN/FULL). Server-only writes.
- **LedgerCode** (`ledgerCodes/{code}`) — deterministic reservation making
  `ledgerCode` unique per workspace. Server-only writes.
- **LedgerEntry** (`workspaces/{ws}/ledgerEntries/{id}`) — immutable
  registration: deterministic id `le_{ledgerBookId}_{recordId}`, sequence
  number, human reference, Record linkage metadata, `entryStatus`
  (ACTIVE / CANCELLED / VOIDED — set only by trusted server paths).

## Sequence semantics (preserved from the original design)

- Scope: per LedgerBook, strictly sequential across blocks.
- Allocation: inside ONE Firestore transaction with the operation journal,
  the entry document, the block bump, and the Record linkage.
- Rollover: when the active block is exhausted it is marked FULL and the next
  block is created in the same transaction.
- Reference format v1: `{PREFIX}-{YYYY}-{NNNNNN}` (e.g. `RESV-2026-000042`).
- Internal ids and human references are separate; ids never change.

## Trusted registration boundary — `ledgerCommand`

Callable `ledgerCommand` (europe-west1), versioned contract `1.0.0`:

| Command | Payload | Server derives |
|---|---|---|
| `CREATE_LEDGER_BOOK` | `ledgerCode`, `name`, `description?`, `blockSize?`, `moduleId?`, `recordType?`, `referencePrefix?` | book id (deterministic from `operationId`), `createdBy`, timestamps, initial block, code reservation |
| `REGISTER_LEDGER_ENTRY` | `recordId`, `ledgerBookId` | entry id, sequence number, reference number, `registeredBy`, `_registeredAt`, Record linkage |

Forbidden payload keys are rejected at the envelope: `actor*, registeredBy/At`,
`sequenceNumber`, `referenceNumber`, `ledgerBlockId`, `nextSequence`,
`blockNumber`, `ledgerEntryId`, timestamps.

### Transaction boundary

All reads first (journal, entry, record, linked-entry, book, block), then all
writes. Journal `COMPLETED` + entry + block + linkage + Audit entry commit in
ONE Firestore transaction, so a crash cannot produce any of:

- sequence consumed without an entry,
- an entry without Record linkage,
- an entry without its Audit evidence,
- a completed journal without the mutation.

Same `operationId` replay → journal replay → identical entry/reference.
A fresh `operationId` for an already-registered Record → the deterministic
entry id is found and returned; no second sequence is consumed.

`maxAttempts: 50` on the registration transaction preserves the historical
contention budget of the old client path.

### Authorization

The engine explicitly checks, because Admin SDK bypasses Rules:

- authenticated Firebase user (`request.auth.uid`),
- Personal workspace owner OR active Organization membership,
- Record exists and belongs to the workspace, status is SUBMITTED / ACTIVE /
  COMPLETED,
- Book exists, is ACTIVE, and module/recordType scope matches.

## Record ↔ Ledger linkage

`record.ledgerEntryId / ledgerBookId / referenceNumber` are written ONLY by
the trusted registration transaction (first registration wins; additional
registrations in OTHER books do not overwrite the primary linkage). Browsers
read them; Firestore Rules deny client Record updates entirely (Step 16).

Linkage consistency is enforced transactionally: entry + linkage + journal +
audit commit together.

## Rules boundary (browsers)

| Collection | Read | Create | Update | Delete |
|---|---|---|---|---|
| ledgerBooks | allowed (workspace-scoped) | ❌ | ❌ | ❌ |
| ledgerBooks/*/blocks | allowed | ❌ | ❌ | ❌ |
| ledgerEntries | allowed | ❌ | ❌ | ❌ |
| ledgerCodes | allowed | ❌ | ❌ | ❌ |

## Workspace Reset

Existing destructive semantics are preserved: Workspace data reset recursively
deletes a workspace's ledgerBooks/ledgerEntries/ledgerCodes (see
`functions/src/workspaceResetContract.js`). Numbering continuity is
workspace-scoped; a reset workspace starts with an empty register space.
This is the ADR-0001 behavior — unchanged by Step 16.

## Performance

- Queries remain bounded (`nextSequence` bump is a single-document write).
- No whole-workspace listeners; Ledger lists/books use paginated repository
  queries.

## Step 17.1 — Universal Form Ledger (auto-registration)

Every official form submission is automatically registered in a per-Module
Form Book. The paper-register invariants hold end-to-end:

- **Auto-provisioning**: the first trusted `SUBMIT_RECORD` (or non-draft
  `CREATE_RECORD`) for a Module derives and creates the Module's Form Book on
  the server (`ensureModuleLedgerBook`, keyed deterministically by Module),
  then registers the Record via the standard `REGISTER_LEDGER_ENTRY` command
  with operation id `auto-register-{operationId}` — replays converge to the
  same entry and never consume a second sequence.
- **Rename/version safety**: the book is derived from the Module identity at
  registration time; historical entries and references never change.
- **Cancellation binding**: a trusted `CANCEL_RECORD` marks the Record's
  Ledger entries CANCELLED in a post-transaction chain
  (`cancelLedgerRegistrationForRecord`). Entries are never deleted and the
  sequence position stays consumed — the same paper-book principle as V1.
- **Form Books UI** (`src/features/ledger/`): the Form Books list shows the
  book row (block range, capacity, filled/voided/remaining counters, status);
  the Book page offers a block strip, status/reference filters and a read-only
  Historical Form Viewer that renders the Record with the exact Module Version
  schema and supports Previous/Next navigation through the register.
- **Composite index**: `(ledgerBookId, ledgerBlockId, sequenceNumber)` on
  `ledgerEntries` powers the per-block sequence projection.
- **Reset**: `recordOperations` was added to the workspace reset contract so
  trusted operation journals cannot survive a reset as ghost data
  (`tests/rules/ledgerReset.integration.test.js` proves ledgerBooks,
  ledgerEntries, blocks, codes, records, modules and recordOperations are all
  wiped and the register restarts at sequence 1).

Drafts never register; only official submissions consume sequence numbers.

## Step 17.1.1 — Configurable Ledger Books & universal sources

**PRESERVATION ≠ ORGANIZATION.** Evidence is created by the trusted chain
regardless of whether anyone has configured a visible register; Ledger Books are
the workspace's intentional organizational views over that evidence.

### Book model additions (single canonical model, no schema split)

- `sourceDefinition` — typed declarative evidence source, closed union.
  v1: `{ type: 'MODULE', moduleId }` (`src/core/ledger/ledgerSourceDefinition.js`).
  Never arbitrary collections/fields/operators. A legacy bare `moduleId` on the
  command payload is normalized to the MODULE source.
- `provisionedBy` — `AUTO` (internal per-Module fallback) or `USER`
  (intentionally configured). Server-derived; only the internal engine call
  (`internal: true`) can produce `AUTO`.

### Registration routing

`ensureModuleLedgerBook` resolves the register for a submitting Module:
the first ACTIVE USER-provisioned book whose source references the Module WINS;
otherwise the deterministic AUTO book is found/created as before.
Composite index used: `ledgerBooks(moduleId, provisionedBy, status)`.

### Trusted historical backfill

Creating a USER book with a source triggers server-side backfill of eligible
historical evidence:

- Eligible: canonical Records of the Module in SUBMITTED/ACTIVE/COMPLETED.
- Order: `_createdAt` ascending; bounded paging (100 × max 10 pages).
- Path: ordinary `REGISTER_LEDGER_ENTRY` with deterministic operation ids
  `backfill-{opId}-{recordId}` → fresh sequences in the NEW book, full
  transaction-committed audit, honest actor attribution (the configuring user).
- Retries/journal replays continue the backfill idempotently; deterministic
  entry ids prevent any duplicate.
- Cancelled pre-book history is NOT fabricated into the new register (it keeps
  its existing evidence); void-after-registration works normally.

### UI

- Ledger main page lists configured + auto books with counters
  (`Used` = active entries, `Voided` = consumed-forever slots,
  `Remaining` excludes consumed) and an honest empty state.
- "New Ledger Book" is a configuration page: Name, Description, Module source
  selector (non-draft Modules), auto-suggested Ledger Code / Reference Prefix
  (overridable), Block Size. Validation + inline trusted-server errors.
- The register page and read-only Historical Form Viewer (exact historical
  ModuleVersion schema, Prev/Next) are unchanged paths.
