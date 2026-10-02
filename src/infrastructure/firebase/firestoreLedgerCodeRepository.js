/**
 * Modulity 2.0 — Firestore Ledger Code Repository
 *
 * Path: workspaces/{workspaceId}/ledgerCodes/{ledgerCode}
 *
 * Deterministic document path for concurrency-safe code uniqueness.
 * Same pattern as moduleCodes/{code}.
 *
 * @module infrastructure/firebase/firestoreLedgerCodeRepository
 */

import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';

export function createFirestoreLedgerCodeRepository(db) {
  function codeDoc(workspaceId, ledgerCode) {
    return doc(db, 'workspaces', workspaceId, 'ledgerCodes', ledgerCode);
  }

  /**
   * Atomically reserves a ledger code.
   * Returns true if reserved, false if already taken.
   */
  async function reserve(workspaceId, ledgerCode, actor) {
    const ref = codeDoc(workspaceId, ledgerCode);
    const snap = await getDoc(ref);
    if (snap.exists()) return false;
    try {
      await setDoc(ref, {
        ledgerCode,
        workspaceId,
        reservedBy: actor,
        reservedAt: new Date().toISOString(),
        _reservedAt: serverTimestamp(),
      });
      return true;
    } catch {
      return false;
    }
  }

  async function exists(workspaceId, ledgerCode) {
    const snap = await getDoc(codeDoc(workspaceId, ledgerCode));
    return snap.exists();
  }

  return { reserve, exists };
}
