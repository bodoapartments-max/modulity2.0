/**
 * Modulity 2.0 — Firestore Ledger Book Repository
 *
 * Path: workspaces/{workspaceId}/ledgerBooks/{ledgerBookId}
 * Blocks: workspaces/{workspaceId}/ledgerBooks/{ledgerBookId}/blocks/{blockId}
 *
 * CRITICAL: bootstrapBookAtomic() creates the code reservation, book,
 * and initial block in ONE Firestore transaction. No orphan reservations.
 *
 * @module infrastructure/firebase/firestoreLedgerBookRepository
 */

import {
  collection, doc, getDoc, getDocs, updateDoc,
  query, orderBy, limit as firestoreLimit,
  serverTimestamp, runTransaction,
} from 'firebase/firestore';

export function createFirestoreLedgerBookRepository(db) {
  function booksCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'ledgerBooks');
  }
  function bookDoc(workspaceId, ledgerBookId) {
    return doc(db, 'workspaces', workspaceId, 'ledgerBooks', ledgerBookId);
  }
  function blockDoc(workspaceId, ledgerBookId, blockId) {
    return doc(db, 'workspaces', workspaceId, 'ledgerBooks', ledgerBookId, 'blocks', blockId);
  }
  function codeDoc(workspaceId, ledgerCode) {
    return doc(db, 'workspaces', workspaceId, 'ledgerCodes', ledgerCode);
  }

  function mapFromFirestore(snap) {
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      ...d,
      ledgerBookId: snap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  async function getById(workspaceId, ledgerBookId) {
    const snap = await getDoc(bookDoc(workspaceId, ledgerBookId));
    return mapFromFirestore(snap);
  }

  async function listByWorkspace(workspaceId) {
    const q = query(booksCol(workspaceId), orderBy('_createdAt', 'desc'), firestoreLimit(100));
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function update(workspaceId, ledgerBookId, changes) {
    const ref = bookDoc(workspaceId, ledgerBookId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  /**
   * ATOMIC: Creates a LedgerBook with code reservation and initial block
   * in ONE Firestore transaction.
   *
   * Ensures:
   *  - Code reservation, book, and initial block are created atomically
   *  - No orphan code reservation on failure
   *  - Idempotent: if book with same code+bookId already exists, returns it
   *
   * @param {Object} book — the LedgerBook value object
   * @param {Object} actor — ActorRef
   * @returns {Object} created book with currentBlockId set
   */
  async function bootstrapBookAtomic(book, actor) {
    return runTransaction(db, async (transaction) => {
      const codeRef = codeDoc(book.workspaceId, book.ledgerCode);
      const codeSnap = await transaction.get(codeRef);

      // If code reservation exists, check if it's our book (idempotent retry)
      if (codeSnap.exists()) {
        const existingCode = codeSnap.data();
        if (existingCode.ledgerBookId === book.ledgerBookId) {
          // Idempotent: same book retrying
          const existingBookSnap = await transaction.get(bookDoc(book.workspaceId, book.ledgerBookId));
          if (existingBookSnap.exists()) {
            return mapFromFirestore(existingBookSnap);
          }
        }
        throw new Error(`Ledger code "${book.ledgerCode}" is already in use`);
      }

      const initialBlockId = 'block_1';
      const bkRef = bookDoc(book.workspaceId, book.ledgerBookId);
      const blkRef = blockDoc(book.workspaceId, book.ledgerBookId, initialBlockId);

      // 1. Reserve code (includes bookId for idempotency)
      transaction.set(codeRef, {
        ledgerCode: book.ledgerCode,
        workspaceId: book.workspaceId,
        ledgerBookId: book.ledgerBookId,
        reservedBy: actor,
        _reservedAt: serverTimestamp(),
      });

      // 2. Create book
      const { createdAt, updatedAt, ...bookRest } = book;
      transaction.set(bkRef, {
        ...bookRest,
        currentBlockId: initialBlockId,
        _createdAt: serverTimestamp(),
        _updatedAt: serverTimestamp(),
      });

      // 3. Create initial block
      transaction.set(blkRef, {
        ledgerBlockId: initialBlockId,
        ledgerBookId: book.ledgerBookId,
        workspaceId: book.workspaceId,
        blockNumber: 1,
        startSequence: 1,
        endSequence: book.blockSize,
        nextSequence: 1,
        capacity: book.blockSize,
        status: 'OPEN',
        closedAt: null,
        createdBy: actor,
        _createdAt: serverTimestamp(),
        _openedAt: serverTimestamp(),
      });

      return { ...book, currentBlockId: initialBlockId };
    });
  }

  /**
   * Gets a specific block.
   */
  async function getBlock(workspaceId, ledgerBookId, blockId) {
    const snap = await getDoc(blockDoc(workspaceId, ledgerBookId, blockId));
    if (!snap.exists()) return null;
    return { ...snap.data(), ledgerBlockId: snap.id };
  }

  /**
   * Lists all blocks for a book.
   */
  async function listBlocks(workspaceId, ledgerBookId) {
    const blocksColRef = collection(db, 'workspaces', workspaceId, 'ledgerBooks', ledgerBookId, 'blocks');
    const q = query(blocksColRef, orderBy('blockNumber', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((s) => ({ ...s.data(), ledgerBlockId: s.id }));
  }

  return {
    getById, listByWorkspace, update,
    bootstrapBookAtomic, getBlock, listBlocks,
  };
}
