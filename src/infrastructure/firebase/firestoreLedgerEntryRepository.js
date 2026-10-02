/**
 * Modulity 2.0 — Firestore Ledger Entry Repository
 *
 * Path: workspaces/{workspaceId}/ledgerEntries/{ledgerEntryId}
 *
 * CRITICAL: registerRecordAtomic() uses a Firestore runTransaction
 * to atomically allocate a sequence number and create the entry.
 * Handles block rollover when the current block is full.
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
    const q = query(
      entriesCol(workspaceId),
      where('ledgerBookId', '==', ledgerBookId),
      where('recordId', '==', recordId),
      firestoreLimit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return mapFromFirestore(snap.docs[0]);
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
   * Uses runTransaction to:
   * 1. Read the book to find currentBlockId
   * 2. Read the current block to get nextSequence
   * 3. If block is full, create a new block (rollover)
   * 4. Increment nextSequence
   * 5. Create LedgerEntry with allocated sequence
   *
   * This guarantees no duplicate sequence numbers even under concurrency.
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
      // 1. Read the book
      const bookRef = bookDoc(workspaceId, ledgerBookId);
      const bookSnap = await transaction.get(bookRef);
      if (!bookSnap.exists()) throw new Error('Ledger book not found');
      const book = bookSnap.data();

      if (book.status !== 'ACTIVE') throw new Error('Ledger book is not active');

      let currentBlockId = book.currentBlockId;
      let blockRef = blockDoc(workspaceId, ledgerBookId, currentBlockId);
      let blockSnap = await transaction.get(blockRef);

      if (!blockSnap.exists()) throw new Error('Current block not found');
      let block = blockSnap.data();

      // 2. Check if block is full and needs rollover
      if (block.nextSequence > block.endSequence) {
        // Mark current block as FULL
        transaction.update(blockRef, { status: 'FULL', closedAt: new Date().toISOString() });

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
          openedAt: new Date().toISOString(),
          closedAt: null,
          createdBy: actor,
          _createdAt: serverTimestamp(),
        });

        // Update book to point to new block
        transaction.update(bookRef, { currentBlockId: newBlockId, _updatedAt: serverTimestamp() });

        currentBlockId = newBlockId;
        block = {
          ledgerBlockId: newBlockId,
          blockNumber: newBlockNumber,
          startSequence: newStartSequence,
          endSequence: newEndSequence,
          nextSequence: newStartSequence,
        };
      }

      // 3. Allocate sequence number
      const sequenceNumber = block.nextSequence;
      const referenceNumber = formatReferenceNumber(
        referencePrefix || book.ledgerCode,
        sequenceNumber,
        referenceFormatVersion || 1,
      );

      // 4. Increment nextSequence on the block
      const activeBlockRef = blockDoc(workspaceId, ledgerBookId, currentBlockId);
      transaction.update(activeBlockRef, { nextSequence: sequenceNumber + 1 });

      // 5. Create the LedgerEntry
      const entryId = `le_${ledgerBookId}_${recordId}`;
      const entryRef = entryDoc(workspaceId, entryId);
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
        registeredAt: new Date().toISOString(),
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

      return entryData;
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
