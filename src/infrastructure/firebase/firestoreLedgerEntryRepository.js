/**
 * Modulity 2.0 — Firestore Ledger Entry Repository
 *
 * Path: workspaces/{workspaceId}/ledgerEntries/{ledgerEntryId}
 *
 * CRITICAL: registerRecordAtomic() uses a Firestore runTransaction
 * to atomically:
 *   1. Check idempotency (existing entry for same book+record)
 *   2. Verify Record exists, is eligible, workspace matches
 *   3. Allocate a sequence number from the active block
 *   4. Handle block rollover if needed
 *   5. Create the LedgerEntry
 *   6. Update Record with ledger linkage
 *
 * All reads and writes happen inside the SAME transaction.
 * No sequence is consumed if the entry already exists.
 *
 * @module infrastructure/firebase/firestoreLedgerEntryRepository
 */

import {
  collection, doc, getDoc, getDocs, updateDoc,
  query, where, orderBy, limit as firestoreLimit,
  startAfter as firestoreStartAfter, documentId,
  serverTimestamp, runTransaction,
} from 'firebase/firestore';
import { formatReferenceNumber } from '../../core/ledger/ledgerBook.js';

/**
 * Derives a deterministic LedgerEntry document ID from bookId + recordId.
 * This ensures at most one entry per (book, record) pair, enforced by Firestore document identity.
 */
export function deterministicLedgerEntryId(ledgerBookId, recordId) {
  return `le_${ledgerBookId}_${recordId}`;
}

export function createFirestoreLedgerEntryRepository(db) {
  function entriesCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'ledgerEntries');
  }
  function entryDoc(workspaceId, entryId) {
    return doc(db, 'workspaces', workspaceId, 'ledgerEntries', entryId);
  }
  function blockDoc(workspaceId, ledgerBookId, blockId) {
    return doc(db, 'workspaces', workspaceId, 'ledgerBooks', ledgerBookId, 'blocks', blockId);
  }
  function bookDoc(workspaceId, ledgerBookId) {
    return doc(db, 'workspaces', workspaceId, 'ledgerBooks', ledgerBookId);
  }
  function recordDoc(workspaceId, recordId) {
    return doc(db, 'workspaces', workspaceId, 'records', recordId);
  }

  function mapFromFirestore(snap) {
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      ...d,
      ledgerEntryId: snap.id,
      registeredAt: d._registeredAt?.toDate?.()?.toISOString?.() || d.registeredAt || null,
    };
  }

  async function getById(workspaceId, entryId) {
    const snap = await getDoc(entryDoc(workspaceId, entryId));
    return mapFromFirestore(snap);
  }

  async function getByBookAndRecord(workspaceId, ledgerBookId, recordId) {
    const entryId = deterministicLedgerEntryId(ledgerBookId, recordId);
    const snap = await getDoc(entryDoc(workspaceId, entryId));
    return mapFromFirestore(snap);
  }

  async function listByRecord(workspaceId, recordId) {
    const q = query(
      entriesCol(workspaceId),
      where('recordId', '==', recordId),
      firestoreLimit(50),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function update(workspaceId, entryId, changes) {
    const ref = entryDoc(workspaceId, entryId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  /**
   * ATOMIC: Registers a Record in a Ledger Book.
   *
   * ALL logic is inside a single Firestore transaction:
   *   1. Derive deterministic entryId from (bookId, recordId)
   *   2. transaction.get(entryRef) — if exists, return idempotently (NO sequence consumed)
   *   3. transaction.get(recordRef) — verify Record exists, eligible, workspace matches
   *   4. transaction.get(bookRef) — verify ACTIVE book
   *   5. transaction.get(blockRef) — read current block, handle rollover
   *   6. Allocate sequence, create entry, update Record linkage — all atomically
   *
   * INVARIANT: same (bookId, recordId) can consume at most ONE sequence number,
   * even under 100 concurrent calls.
   */
  async function registerRecordAtomic(workspaceId, {
    ledgerBookId,
    recordId,
    moduleId,
    moduleVersion,
    recordType,
    referencePrefix,
    referenceFormatVersion,
    actor,
  }) {
    return runTransaction(db, async (transaction) => {
      // 1. Derive deterministic entry ID and check idempotency INSIDE transaction
      const entryId = deterministicLedgerEntryId(ledgerBookId, recordId);
      const entryRef = entryDoc(workspaceId, entryId);
      const existingSnap = await transaction.get(entryRef);

      if (existingSnap.exists()) {
        // IDEMPOTENT: entry already exists — return it without allocating anything
        const existing = existingSnap.data();
        return {
          ...existing,
          ledgerEntryId: existingSnap.id,
          registeredAt: existing._registeredAt?.toDate?.()?.toISOString?.() || existing.registeredAt || null,
          _idempotent: true,
        };
      }

      // 2. Verify Record inside transaction
      const recRef = recordDoc(workspaceId, recordId);
      const recSnap = await transaction.get(recRef);
      if (!recSnap.exists()) throw new Error('Record not found');
      const rec = recSnap.data();
      if (rec.workspaceId !== workspaceId) throw new Error('Record workspace mismatch');

      // Check Record is not already linked to a DIFFERENT entry in this book
      // (should not happen with deterministic IDs, but defense-in-depth)
      if (rec.ledgerEntryId && rec.ledgerBookId === ledgerBookId) {
        // Record already linked to this book — idempotent
        const linkedSnap = await transaction.get(entryDoc(workspaceId, rec.ledgerEntryId));
        if (linkedSnap.exists()) {
          const linked = linkedSnap.data();
          return {
            ...linked,
            ledgerEntryId: linkedSnap.id,
            registeredAt: linked._registeredAt?.toDate?.()?.toISOString?.() || linked.registeredAt || null,
            _idempotent: true,
          };
        }
      }

      // 3. Read the book
      const bkRef = bookDoc(workspaceId, ledgerBookId);
      const bookSnap = await transaction.get(bkRef);
      if (!bookSnap.exists()) throw new Error('Ledger book not found');
      const book = bookSnap.data();
      if (book.status !== 'ACTIVE') throw new Error('Ledger book is not active');

      // Validate module/recordType scope
      if (book.moduleId && moduleId !== book.moduleId) {
        throw new Error('Record moduleId does not match Ledger Book scope');
      }
      if (book.recordType && recordType !== book.recordType) {
        throw new Error('Record recordType does not match Ledger Book scope');
      }

      // 4. Read current block
      let currentBlockId = book.currentBlockId;
      let blkRef = blockDoc(workspaceId, ledgerBookId, currentBlockId);
      let blockSnap = await transaction.get(blkRef);
      if (!blockSnap.exists()) throw new Error('Current block not found');
      let block = blockSnap.data();

      // 5. Handle block rollover if block is full
      if (block.nextSequence > block.endSequence) {
        // Mark current block as FULL (server timestamp for closedAt)
        transaction.update(blkRef, {
          status: 'FULL',
          _closedAt: serverTimestamp(),
        });

        // Create new block
        const newBlockNumber = block.blockNumber + 1;
        const newStartSequence = block.endSequence + 1;
        const newEndSequence = newStartSequence + book.blockSize - 1;
        const newBlockId = `block_${newBlockNumber}`;
        const newBlockRef = blockDoc(workspaceId, ledgerBookId, newBlockId);

        transaction.set(newBlockRef, {
          ledgerBlockId: newBlockId,
          ledgerBookId,
          workspaceId,
          blockNumber: newBlockNumber,
          startSequence: newStartSequence,
          endSequence: newEndSequence,
          nextSequence: newStartSequence,
          capacity: book.blockSize,
          status: 'OPEN',
          closedAt: null,
          createdBy: actor,
          _createdAt: serverTimestamp(),
          _openedAt: serverTimestamp(),
        });

        // Update book to point to new block
        transaction.update(bkRef, { currentBlockId: newBlockId, _updatedAt: serverTimestamp() });

        currentBlockId = newBlockId;
        block = {
          ledgerBlockId: newBlockId,
          blockNumber: newBlockNumber,
          startSequence: newStartSequence,
          endSequence: newEndSequence,
          nextSequence: newStartSequence,
        };
      }

      // 6. Allocate sequence number
      const sequenceNumber = block.nextSequence;
      const referenceNumber = formatReferenceNumber(
        referencePrefix || book.ledgerCode,
        sequenceNumber,
        referenceFormatVersion || 1,
      );

      // 7. Increment nextSequence on the block
      const activeBlockRef = blockDoc(workspaceId, ledgerBookId, currentBlockId);
      transaction.update(activeBlockRef, { nextSequence: sequenceNumber + 1 });

      // 8. Create the LedgerEntry (deterministic ID — create-once semantics)
      const entryData = {
        ledgerEntryId: entryId,
        workspaceId,
        ledgerBookId,
        ledgerBlockId: currentBlockId,
        recordId,
        moduleId: moduleId || null,
        moduleVersion: moduleVersion || null,
        recordType: recordType || null,
        sequenceNumber,
        referenceNumber,
        referenceFormatVersion: referenceFormatVersion || 1,
        entryStatus: 'ACTIVE',
        registeredBy: actor,
        cancelledAt: null,
        cancelledBy: null,
        cancellationReason: null,
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
        supersededByRecordId: null,
        _registeredAt: serverTimestamp(),
      };
      transaction.set(entryRef, entryData);

      // 9. Atomically update Record with ledger linkage
      // Only set linkage for the FIRST registration (primary ledger reference)
      // If Record already has a ledger linkage to a different book, leave it
      if (!rec.ledgerEntryId) {
        transaction.update(recRef, {
          ledgerEntryId: entryId,
          ledgerBookId: ledgerBookId,
          referenceNumber: referenceNumber,
          _updatedAt: serverTimestamp(),
        });
      }

      return { ...entryData, _idempotent: false };
    });
  }

  /**
   * Paginated query for ledger entries in a book.
   */
  async function paginatedQuery(workspaceId, params) {
    const constraints = [];

    if (params.ledgerBookId) {
      constraints.push(where('ledgerBookId', '==', params.ledgerBookId));
    }
    if (params.ledgerBlockId) {
      constraints.push(where('ledgerBlockId', '==', params.ledgerBlockId));
    }
    if (params.entryStatus) {
      constraints.push(where('entryStatus', '==', params.entryStatus));
    }
    if (params.moduleId) {
      constraints.push(where('moduleId', '==', params.moduleId));
    }
    if (params.recordType) {
      constraints.push(where('recordType', '==', params.recordType));
    }
    if (params.recordId) {
      constraints.push(where('recordId', '==', params.recordId));
    }

    const sortField = params.sortField === 'registeredAt' ? '_registeredAt' : 'sequenceNumber';
    const direction = params.sortDirection || 'asc';
    constraints.push(orderBy(sortField, direction));
    constraints.push(orderBy(documentId(), direction));

    if (params.startAfter) {
      constraints.push(firestoreStartAfter(params.startAfter));
    }

    const fetchLimit = (params.limit || 25) + 1;
    constraints.push(firestoreLimit(fetchLimit));

    const q = query(entriesCol(workspaceId), ...constraints);
    const snap = await getDocs(q);
    const docs = snap.docs.map(mapFromFirestore);
    const limit = params.limit || 25;
    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    const lastDoc = hasMore ? snap.docs[limit - 1] : null;

    return { items, nextCursor: lastDoc || null, hasMore };
  }

  return {
    getById, getByBookAndRecord, listByRecord, update,
    registerRecordAtomic, paginatedQuery,
  };
}
