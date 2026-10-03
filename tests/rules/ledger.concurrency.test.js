/**
 * Modulity 2.0 — Ledger Concurrency Integration Tests (Step 16)
 *
 * Step 16 moved Ledger registration behind the trusted ledgerCommand
 * boundary. This suite drives `executeLedgerCommand` (functions/src) with
 * the firebase-admin SDK against the real Firestore Emulator — the same
 * transaction semantics the Cloud Function has in production.
 *
 * This suite REPLACES the historical client-transaction concurrency test,
 * whose flakiness came from browser-SDK transactions racing under full
 * emulator load. Browser clients can no longer register Ledger entries at
 * all (Firestore Rules: read-only).
 *
 * MANDATORY invariants:
 *   A. 20 concurrent registrations of SAME Record → 1 entry, 1 sequence
 *   B. 50 concurrent DISTINCT Records → 50 unique contiguous sequences
 *   C. Rollover across block boundary stays correct
 *   D. Same operationId replay ⇔ same entry, no second sequence
 */

/* eslint-disable no-undef */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
// Same nested import path the other rules integration suites use — the
// functions engine resolves firebase-admin from functions/node_modules, so
// tests must use the same instance for Timestamp/FieldValue identity.
import { initializeApp, deleteApp, getApps } from '../../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore } from '../../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { executeLedgerCommand } from '../../functions/src/ledgerCommandEngine.js';
import { buildRegisterLedgerEntryCommand } from '../../src/core/ledger/ledgerCommandContract.js';

const PROJECT_ID = 'modulity-concurrency-test';
const WS = 'ws-conc';
const BOOK = 'lb-conc';

let app;
let db;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST must be set (run via npm run test:rules)');
  }
  if (!getApps().length) {
    app = initializeApp({ projectId: PROJECT_ID }, 'ledger-concurrency');
  } else {
    app = getApps()[0];
  }
  db = getFirestore(app);
});

afterAll(async () => {
  const entries = await db.collection(`workspaces/${WS}/ledgerEntries`).get();
  void entries;
  if (app) await deleteApp(app).catch(() => {});
});

beforeEach(async () => {
  // Wipe workspace state between tests (admin SDK — rules bypassed)
  for (const path of [
    `workspaces/${WS}`,
    `workspaces/${WS}/ledgerBooks/${BOOK}`,
  ]) {
    const snap = await db.doc(path).get().catch(() => null);
    void snap;
  }
  const collections = ['ledgerEntries', 'records', 'recordOperations', 'auditEntries', 'ledgerCodes'];
  for (const col of collections) {
    const snap = await db.collection(`workspaces/${WS}/${col}`).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  const booksSnap = await db.collection(`workspaces/${WS}/ledgerBooks`).get();
  for (const book of booksSnap.docs) {
    const blocks = await book.ref.collection('blocks').get();
    blocks.docs.forEach((d) => { void d; });
    const batch = db.batch();
    blocks.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(book.ref);
    await batch.commit();
  }

  await db.doc(`workspaces/${WS}`).set({ workspaceId: WS, type: 'PERSONAL', ownerUserId: 'user1', name: 'Test WS' });
});

async function seedBook(blockSize = 100) {
  await db.doc(`workspaces/${WS}/ledgerBooks/${BOOK}`).set({
    ledgerBookId: BOOK, workspaceId: WS, ledgerCode: 'RI', name: 'Test Book',
    status: 'ACTIVE', blockSize, currentBlockId: 'block_1',
    referencePrefix: 'RI', referenceFormatVersion: 1,
    numberingStrategy: 'SEQUENTIAL',
    createdBy: { actorType: 'USER', actorId: 'user1' },
  });
  await db.doc(`workspaces/${WS}/ledgerBooks/${BOOK}/blocks/block_1`).set({
    ledgerBlockId: 'block_1', ledgerBookId: BOOK, workspaceId: WS,
    blockNumber: 1, startSequence: 1, endSequence: blockSize,
    nextSequence: 1, capacity: blockSize, status: 'OPEN',
    closedAt: null, createdBy: { actorType: 'USER', actorId: 'user1' },
  });
}

async function seedRecord(recordId, { linked = false } = {}) {
  await db.doc(`workspaces/${WS}/records/${recordId}`).set({
    recordId, workspaceId: WS, recordType: 'inspection', status: 'SUBMITTED',
    data: {}, moduleId: null, moduleVersion: null,
    createdBy: { actorType: 'USER', actorId: 'user1' },
    ledgerEntryId: linked ? 'le-x' : null, ledgerBookId: null, referenceNumber: null,
  });
}

function register(recordId, operationId) {
  return executeLedgerCommand(db, {
    userId: 'user1',
    command: buildRegisterLedgerEntryCommand({ operationId, workspaceId: WS, recordId, ledgerBookId: BOOK }),
  });
}

describe('Ledger concurrency (trusted server path)', () => {
  // 50-way transaction contention on one sequence document is slow on the
  // local emulator; the budget must cover honest retries rather than hide them.
  const TX_TIMEOUT = 180_000;

  it('A. 20 concurrent registrations of the SAME Record produce exactly 1 entry and consume 1 sequence', { timeout: TX_TIMEOUT }, async () => {
    await seedBook(100);
    await seedRecord('rec-same');

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => register('rec-same', `op-same-${i}`)),
    );

    // Every concurrent request either completes or is told to retry after
    // the in-flight operation — the invariant is the STORE state:
    const entries = await db.collection(`workspaces/${WS}/ledgerEntries`).get();
    expect(entries.size).toBe(1);
    const entry = entries.docs[0].data();
    expect(entry.sequenceNumber).toBe(1);

    // Sequence consumed exactly once
    const block = await db.doc(`workspaces/${WS}/ledgerBooks/${BOOK}/blocks/block_1`).get();
    expect(block.data().nextSequence).toBe(2);

    // Record linkage consistent with the entry
    const rec = await db.doc(`workspaces/${WS}/records/rec-same`).get();
    expect(rec.data().ledgerEntryId).toBe(entry.ledgerEntryId);
    expect(rec.data().referenceNumber).toBe(entry.referenceNumber);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    const references = new Set(succeeded.map((r) => r.value.entry.referenceNumber));
    expect(references.size).toBe(1);
  });

  it('B. 50 concurrent DISTINCT Records produce 50 unique contiguous sequences across block rollover', { timeout: TX_TIMEOUT }, async () => {
    await seedBook(30); // force rollover at 30
    for (let i = 0; i < 50; i++) await seedRecord(`rec-${i}`);

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) => register(`rec-${i}`, `op-distinct-${i}`)),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').map((r) => r.value.entry);
    expect(succeeded.length).toBe(50, `all distinct registrations must succeed; rejected: ${results.filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason)).join(' | ')}`);

    const sequences = succeeded.map((e) => e.sequenceNumber).sort((a, b) => a - b);
    expect(new Set(sequences).size).toBe(50);

    // Contiguity inside each block (rollover permitted between blocks)
    const block2 = await db.doc(`workspaces/${WS}/ledgerBooks/${BOOK}/blocks/block_2`).get();
    expect(block2.exists).toBe(true);
    expect(block2.data().startSequence).toBe(31);
    expect(sequences[0]).toBe(1);
    expect(sequences[49]).toBe(50);

    const refs = succeeded.map((e) => e.referenceNumber);
    expect(new Set(refs).size).toBe(50);
  });

  it('C. same operationId replay returns the same entry and never consumes a second sequence', { timeout: TX_TIMEOUT }, async () => {
    await seedBook(10);
    await seedRecord('rec-replay');

    const cmd = buildRegisterLedgerEntryCommand({ operationId: 'op-replay-1', workspaceId: WS, recordId: 'rec-replay', ledgerBookId: BOOK });
    const first = await executeLedgerCommand(db, { userId: 'user1', command: cmd });
    const second = await executeLedgerCommand(db, { userId: 'user1', command: buildRegisterLedgerEntryCommand({ operationId: 'op-replay-1', workspaceId: WS, recordId: 'rec-replay', ledgerBookId: BOOK }) });

    expect(second.idempotent).toBe(true);
    expect(second.entry.referenceNumber).toBe(first.entry.referenceNumber);

    const entries = await db.collection(`workspaces/${WS}/ledgerEntries`).get();
    expect(entries.size).toBe(1);
    const block = await db.doc(`workspaces/${WS}/ledgerBooks/${BOOK}/blocks/block_1`).get();
    expect(block.data().nextSequence).toBe(2);
  });

  it('D. same operationId with a different Record is rejected as mismatch', { timeout: TX_TIMEOUT }, async () => {
    await seedBook(10);
    await seedRecord('rec-a');
    await seedRecord('rec-b');

    await register('rec-a', 'op-mismatch');
    await expect(register('rec-b', 'op-mismatch')).rejects.toMatchObject({
      details: { code: 'OPERATION_MISMATCH' },
    });
  });
});
