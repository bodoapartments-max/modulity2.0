/**
 * Modulity 2.0 — Firestore Ledger Book Repository
 *
 * Path: workspaces/{workspaceId}/ledgerBooks/{ledgerBookId}
 * Blocks: workspaces/{workspaceId}/ledgerBooks/{ledgerBookId}/blocks/{blockId}
 *
 * @module infrastructure/firebase/firestoreLedgerBookRepository
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit as firestoreLimit,
  serverTimestamp,
} from 'firebase/firestore';

export function createFirestoreLedgerBookRepository(db) {
  function booksCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'ledgerBooks');
  }
  function bookDoc(workspaceId, ledgerBookId) {
    return doc(db, 'workspaces', workspaceId, 'ledgerBooks', ledgerBookId);
  }
  function blocksCol(workspaceId, ledgerBookId) {
    return collection(db, 'workspaces', workspaceId, 'ledgerBooks', ledgerBookId, 'blocks');
  }
  function blockDoc(workspaceId, ledgerBookId, blockId) {
    return doc(db, 'workspaces', workspaceId, 'ledgerBooks', ledgerBookId, 'blocks', blockId);
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

  async function create(book) {
    const ref = bookDoc(book.workspaceId, book.ledgerBookId);
    const { createdAt, updatedAt, ...rest } = book;
    await setDoc(ref, { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() });
    return book;
  }

  async function update(workspaceId, ledgerBookId, changes) {
    const ref = bookDoc(workspaceId, ledgerBookId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  /**
   * Opens the initial block for a new Ledger Book.
   * Returns the blockId.
   */
  async function openInitialBlock(workspaceId, ledgerBookId, blockSize, actor) {
    const blockId = `block_1`;
    const ref = blockDoc(workspaceId, ledgerBookId, blockId);
    await setDoc(ref, {
      ledgerBlockId: blockId,
      ledgerBookId,
      workspaceId,
      blockNumber: 1,
      startSequence: 1,
      endSequence: blockSize,
      nextSequence: 1,
      capacity: blockSize,
      status: 'OPEN',
      openedAt: new Date().toISOString(),
      closedAt: null,
      createdBy: actor,
      _createdAt: serverTimestamp(),
    });
    return blockId;
  }

  /**
   * Gets the current open block for a book.
   */
  async function getCurrentBlock(workspaceId, ledgerBookId) {
    const q = query(
      blocksCol(workspaceId, ledgerBookId),
      where('status', '==', 'OPEN'),
      firestoreLimit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0].data();
    return { ...d, ledgerBlockId: snap.docs[0].id };
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
    const q = query(blocksCol(workspaceId, ledgerBookId), orderBy('blockNumber', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((s) => ({ ...s.data(), ledgerBlockId: s.id }));
  }

  return {
    getById, listByWorkspace, create, update,
    openInitialBlock, getCurrentBlock, getBlock, listBlocks,
  };
}
