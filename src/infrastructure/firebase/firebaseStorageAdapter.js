/**
 * Modulity 2.0 — Firebase Storage Adapter (Step 30)
 *
 * Implements the canonical File Storage Contract
 * (src/core/files/fileStorageContract.js) over Firebase Storage.
 *
 * Authorization for uploads/downloads is enforced by Firebase Storage Rules
 * (storage.rules) scoped to workspace paths. `getDownloadUrl` returns a
 * Firebase token URL — a bearer link that remains valid until revoked, NOT a
 * bounded/authorized capability. The canonical authorization model is the
 * workspace-scoped Rules + File metadata; durable signed-URL issuance is a
 * documented deferred production concern (docs/UNIVERSAL_FILES.md).
 *
 * @module infrastructure/firebase/firebaseStorageAdapter
 */

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { firebaseStorage } from './firebaseApp.js';

function storage() {
  if (!firebaseStorage) {
    throw new Error('File storage is not configured. Set VITE_FIREBASE_STORAGE_BUCKET.');
  }
  return firebaseStorage;
}

/**
 * @returns {import('../../core/files/fileStorageContract.js').FileStorageAdapter}
 */
export function createFirebaseStorageAdapter() {
  return Object.freeze({
    async upload(storagePath, content, { contentType = 'application/octet-stream' } = {}) {
      if (!storagePath) throw new Error('storagePath is required');
      const objectRef = ref(storage(), storagePath);
      const snapshot = await uploadBytes(objectRef, content, { contentType });
      return { storagePath, size: snapshot.metadata.size };
    },
    async getDownloadUrl(storagePath) {
      if (!storagePath) throw new Error('storagePath is required');
      return getDownloadURL(ref(storage(), storagePath));
    },
    async remove(storagePath) {
      if (!storagePath) throw new Error('storagePath is required');
      await deleteObject(ref(storage(), storagePath));
    },
    async exists() {
      // Firebase client SDK has no cheap existence probe; metadata fetch
      // would fail-closed on missing objects. Not part of active flows.
      throw new Error('exists is not implemented by the Firebase Storage adapter.');
    },
  });
}
