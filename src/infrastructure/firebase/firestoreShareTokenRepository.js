/**
 * Modulity 2.0 — Firestore Share Token Repository
 *
 * Path: workspaces/{workspaceId}/shareTokens/{tokenId}
 *
 * SECURITY: Only the SHA-256 hash of the token is stored. Never the plaintext.
 *
 * Includes redeemTokenAtomic() which uses a Firestore transaction for
 * concurrency-safe redemption (prevents exceeding maxRedemptions).
 *
 * @module infrastructure/firebase/firestoreShareTokenRepository
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 */
export function createFirestoreShareTokenRepository(db) {
  function tokensCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'shareTokens');
  }

  function tokenDoc(workspaceId, tokenId) {
    return doc(db, 'workspaces', workspaceId, 'shareTokens', tokenId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      tokenId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(token) {
    const { createdAt, updatedAt, ...rest } = token;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  async function getById(workspaceId, tokenId) {
    const snap = await getDoc(tokenDoc(workspaceId, tokenId));
    return mapFromFirestore(snap);
  }

  async function getByHash(workspaceId, tokenHash) {
    const q = query(tokensCol(workspaceId), where('tokenHash', '==', tokenHash));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return mapFromFirestore(snap.docs[0]);
  }

  async function create(token) {
    const ref = tokenDoc(token.workspaceId, token.tokenId);
    await setDoc(ref, mapToFirestore(token));
    return token;
  }

  async function update(workspaceId, tokenId, changes) {
    const ref = tokenDoc(workspaceId, tokenId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  /**
   * Atomically redeems a share token inside a Firestore transaction.
   *
   * Reads the token, validates it is ACTIVE / not expired / not at limit,
   * then increments redemptionCount and updates status — all within a
   * single transaction to prevent concurrent over-redemption.
   *
   * @param {string} workspaceId
   * @param {string} tokenId
   * @param {string} userId — the authenticated user redeeming (request.auth.uid)
   * @returns {Promise<{ token: Object, recordId: string, scope: string }>}
   */
  async function redeemTokenAtomic(workspaceId, tokenId, userId) {
    const ref = tokenDoc(workspaceId, tokenId);

    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        throw new Error('Share token not found');
      }
      const data = snap.data();

      // Status check
      if (data.status !== 'ACTIVE') {
        throw new Error('Token is no longer active');
      }

      // Expiration check (inside transaction)
      if (data.expiresAt) {
        const expiresDate = data.expiresAt?.toDate
          ? data.expiresAt.toDate()
          : new Date(data.expiresAt);
        if (expiresDate < new Date()) {
          transaction.update(ref, {
            status: 'EXPIRED',
            _updatedAt: serverTimestamp(),
          });
          throw new Error('Token has expired');
        }
      }

      // Redemption limit check (inside transaction — concurrency-safe)
      if (data.maxRedemptions > 0 && data.redemptionCount >= data.maxRedemptions) {
        throw new Error('Token redemption limit reached');
      }

      const newCount = (data.redemptionCount || 0) + 1;
      const newStatus = (data.maxRedemptions > 0 && newCount >= data.maxRedemptions)
        ? 'REDEEMED'
        : 'ACTIVE';

      transaction.update(ref, {
        redemptionCount: newCount,
        redeemedByUserId: userId,
        status: newStatus,
        _updatedAt: serverTimestamp(),
      });

      return {
        token: {
          ...data,
          tokenId: snap.id,
          redemptionCount: newCount,
          redeemedByUserId: userId,
          status: newStatus,
        },
        recordId: data.recordId,
        scope: data.scope,
      };
    });

    return result;
  }

  async function listByRecord(workspaceId, recordId) {
    const q = query(tokensCol(workspaceId), where('recordId', '==', recordId));
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  return { getById, getByHash, create, update, redeemTokenAtomic, listByRecord };
}
