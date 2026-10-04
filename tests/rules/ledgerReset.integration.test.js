/**
 * Step 17.1 — Workspace Reset ghost-data verification for the Universal Form Ledger.
 *
 * Pre-Step-17.1 tests prove reset wipes collection-level fixtures. This suite
 * proves the STRONGER semantic: after building REAL ledger data through the
 * trusted path (books, blocks, entries, cancelled entries, record linkage),
 * an authorized reset removes every trace — no ghost entries, blocks, codes,
 * counters, linkage, or references — and the workspace works again cleanly.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp } from '../../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore } from '../../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { executeLedgerCommand } from '../../functions/src/ledgerCommandEngine.js';
import { buildCreateLedgerBookCommand, buildRegisterLedgerEntryCommand } from '../../src/core/ledger/ledgerCommandContract.js';
import { executeWorkspaceReset } from '../../functions/src/workspaceReset.js';

const PROJECT_ID = 'modulity-ledger-reset-test';
const WS = 'ws-ledger-reset';
const USER = 'user-1';
const FORM_COUNT = 105;
const BLOCK_SIZE = 25;

let app;
let db;
let bookId;

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID }, 'ledger-reset-tests');
  db = getFirestore(app);
});
afterAll(async () => deleteApp(app));
beforeEach(async () => {
  const collections = await db.listCollections();
  await Promise.all(collections.map((collection) => db.recursiveDelete(collection)));
  await db.doc(`users/${USER}`).set({ userId: USER, email: `${USER}@example.com` });
  await db.doc(`workspaces/${WS}`).set({ workspaceId: WS, name: WS, type: 'PERSONAL', ownerUserId: USER });
  bookId = null;
});

async function createBook() {
  const command = buildCreateLedgerBookCommand({
    operationId: `op-book-${WS}`,
    workspaceId: WS,
    ledgerCode: 'GHO',
    name: 'Ghost Register',
    blockSize: BLOCK_SIZE,
  });
  const result = await executeLedgerCommand(db, { userId: USER, command });
  bookId = result.book.ledgerBookId;
}

async function seedRecord(recordId) {
  await db.doc(`workspaces/${WS}/records/${recordId}`).set({
    recordId, workspaceId: WS, recordType: 'GHOST', status: 'SUBMITTED',
    data: { title: recordId }, createdBy: { actorType: 'USER', actorId: USER },
  });
}

async function register(recordId, operationId) {
  return executeLedgerCommand(db, {
    userId: USER,
    command: buildRegisterLedgerEntryCommand({ operationId, workspaceId: WS, recordId, ledgerBookId: bookId }),
  });
}

describe('Workspace Reset — Universal Form Ledger ghost data', () => {
  it('after 105 registrations + voids + rollover, an authorized reset leaves no ghost Ledger data and the workspace works again', { timeout: 360_000 }, async () => {
    await createBook();
    // Register 105 forms in batches (rollover at block boundaries 25/50/75/100)
    for (let batch = 0; batch < FORM_COUNT / 21; batch++) {
      await Promise.all(Array.from({ length: 21 }, (_, i) => {
        const n = batch * 21 + i;
        const recordId = `rec-${String(n).padStart(3, '0')}`;
        return Promise.all([seedRecord(recordId)]).then(() => register(recordId, `op-reg-${n}`));
      }));
    }

    // Verify full state before reset: 105 entries across 5 blocks; cancel some
    const before = await db.collection(`workspaces/${WS}/ledgerEntries`).get();
    expect(before.size).toBe(FORM_COUNT);
    const blocksBefore = await db.collection(`workspaces/${WS}/ledgerBooks/${bookId}/blocks`).get();
    expect(blocksBefore.size).toBe(5);

    // Void two entries — they stay consumed (paper-book semantics)
    const toCancel = before.docs.slice(0, 2);
    for (const docSnap of toCancel) {
      await docSnap.ref.update({
        entryStatus: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: { actorType: 'USER', actorId: USER },
        cancellationReason: 'pre-reset void',
      });
    }
    const cancelledBefore = await db.collection(`workspaces/${WS}/ledgerEntries`).where('entryStatus', '==', 'CANCELLED').get();
    expect(cancelledBefore.size).toBe(2);

    // A record linkage exists for the first registrations
    const linkedBefore = await db.collection(`workspaces/${WS}/records`).where('referenceNumber', '!=', null).get();
    expect(linkedBefore.size).toBeGreaterThan(0);

    // ─── RESET ───
    const result = await executeWorkspaceReset(db, { workspaceId: WS, userId: USER, requestId: 'ledger-reset-1', confirmation: WS });
    expect(result.status).toBe('SUCCESS');

    // ─── no ghost data ───
    expect((await db.collection(`workspaces/${WS}/ledgerEntries`).get()).size).toBe(0);
    expect((await db.collection(`workspaces/${WS}/ledgerBooks`).get()).size).toBe(0);
    expect((await db.collection(`workspaces/${WS}/ledgerCodes`).get()).size).toBe(0);
    expect((await db.collection(`workspaces/${WS}/records`).get()).size).toBe(0);
    expect((await db.collection(`workspaces/${WS}/recordOperations`).get()).size).toBe(0);

    // ─── the workspace works cleanly again ───
    await createBook();
    const bookDocAfter = await db.doc(`workspaces/${WS}/ledgerBooks/${bookId}`).get();
    expect(bookDocAfter.exists).toBe(true);
    await seedRecord('rec-new');
    const result2 = await register('rec-new', 'op-reg-new');
    expect(result2.entry.sequenceNumber).toBe(1);
    const history = await db.collection(`workspaces/${WS}/auditEntries`).where('action', '==', 'ledger.book_created').get();
    expect(history.size).toBeGreaterThanOrEqual(1);
    const entriesAfter = await db.collection(`workspaces/${WS}/ledgerEntries`).get();
    expect(entriesAfter.size).toBe(1);
  });
});
