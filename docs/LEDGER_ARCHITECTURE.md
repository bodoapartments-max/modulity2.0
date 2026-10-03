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
  number, human reference, Record linkage metadata, `entryStatus` (ACTIVE;
  future CANCELLED/VOIDED come from trusted commands — deferred until then).

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
