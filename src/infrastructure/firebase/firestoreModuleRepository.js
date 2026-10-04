/**
 * Modulity 2.0 — Firestore Module Repository
 *
 * Paths:
 *   workspaces/{workspaceId}/modules/{moduleId}
 *   workspaces/{workspaceId}/modules/{moduleId}/versions/{version}
 *   workspaces/{workspaceId}/moduleCodes/{normalizedCode}
 *
 * @module infrastructure/firebase/firestoreModuleRepository
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
  limit,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('../../modules/moduleRepository.js').ModuleRepository}
 */
export function createFirestoreModuleRepository(db) {
  function modulesCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'modules');
  }

  function moduleDoc(workspaceId, moduleId) {
    return doc(db, 'workspaces', workspaceId, 'modules', moduleId);
  }

  function versionDoc(workspaceId, moduleId, version) {
    return doc(db, 'workspaces', workspaceId, 'modules', moduleId, 'versions', String(version));
  }

  function versionsCol(workspaceId, moduleId) {
    return collection(db, 'workspaces', workspaceId, 'modules', moduleId, 'versions');
  }

  function codeReservationDoc(workspaceId, normalizedCode) {
    return doc(db, 'workspaces', workspaceId, 'moduleCodes', normalizedCode);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      moduleId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(mod) {
    const { createdAt, updatedAt, ...rest } = mod;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  function mapVersionFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
    };
  }

  async function getById(workspaceId, moduleId) {
    const snap = await getDoc(moduleDoc(workspaceId, moduleId));
    return mapFromFirestore(snap);
  }

  async function getByCode(workspaceId, moduleCode) {
    const q = query(modulesCol(workspaceId), where('moduleCode', '==', moduleCode));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return mapFromFirestore(snap.docs[0]);
  }

  async function listByWorkspace(workspaceId, maxResults = 100) {
    const snap = await getDocs(query(modulesCol(workspaceId), limit(Math.min(maxResults, 500))));
    return snap.docs.map(mapFromFirestore);
  }

  async function create(mod) {
    const ref = moduleDoc(mod.workspaceId, mod.moduleId);
    await setDoc(ref, mapToFirestore(mod));
    return mod;
  }

  async function update(workspaceId, moduleId, changes) {
    const ref = moduleDoc(workspaceId, moduleId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  async function archive(workspaceId, moduleId) {
    return update(workspaceId, moduleId, { status: 'ARCHIVED' });
  }

  // ─── Module Version Snapshots ─────────────────────────

  /**
   * Creates an immutable Module Version snapshot.
   * Uses writeBatch to atomically write the version snapshot and update
   * the Module's currentVersion field.
   */
  async function createVersionSnapshot(workspaceId, moduleId, versionData, moduleUpdates = {}) {
    const batch = writeBatch(db);

    const vRef = versionDoc(workspaceId, moduleId, versionData.version);
    const { createdAt: _ca, ...versionRest } = versionData;
    batch.set(vRef, { ...versionRest, _createdAt: serverTimestamp() });

    // Also update the parent module document atomically
    if (Object.keys(moduleUpdates).length > 0) {
      const mRef = moduleDoc(workspaceId, moduleId);
      batch.update(mRef, { ...moduleUpdates, _updatedAt: serverTimestamp() });
    }

    await batch.commit();
    return versionData;
  }

  async function getVersionSnapshot(workspaceId, moduleId, version) {
    const snap = await getDoc(versionDoc(workspaceId, moduleId, version));
    return mapVersionFromFirestore(snap);
  }

  async function listVersionSnapshots(workspaceId, moduleId) {
    const snap = await getDocs(versionsCol(workspaceId, moduleId));
    return snap.docs.map(mapVersionFromFirestore);
  }

  // ─── Module Code Reservation ──────────────────────────

  /**
   * Atomically creates a Module and reserves its moduleCode.
   * Uses writeBatch to ensure code reservation and module creation are atomic.
   *
   * Reservation path: workspaces/{workspaceId}/moduleCodes/{normalizedCode}
   */
  async function createModuleWithCodeReservation(mod) {
    const batch = writeBatch(db);

    // Reserve the code
    const codeRef = codeReservationDoc(mod.workspaceId, mod.moduleCode);
    batch.set(codeRef, {
      moduleCode: mod.moduleCode,
      moduleId: mod.moduleId,
      workspaceId: mod.workspaceId,
      reservedAt: serverTimestamp(),
      reservedBy: mod.createdBy,
    });

    // Create the module
    const mRef = moduleDoc(mod.workspaceId, mod.moduleId);
    batch.set(mRef, mapToFirestore(mod));

    await batch.commit();
    return mod;
  }

  /**
   * Checks if a moduleCode is already reserved in the workspace.
   * Returns the reservation document or null.
   */
  async function isCodeReserved(workspaceId, moduleCode) {
    const snap = await getDoc(codeReservationDoc(workspaceId, moduleCode));
    if (!snap.exists()) return null;
    return snap.data();
  }

  /**
   * Lists all reserved module codes in the workspace (bounded).
   * Used for deterministic collision-safe technical identifier generation.
   */
  async function listCodes(workspaceId, maxResults = 500) {
    const col = collection(db, 'workspaces', workspaceId, 'moduleCodes');
    const snap = await getDocs(query(col, limit(Math.min(maxResults, 500))));
    return snap.docs.map((d) => d.id);
  }

  return {
    getById,
    getByCode,
    listByWorkspace,
    create,
    update,
    archive,
    createVersionSnapshot,
    getVersionSnapshot,
    listVersionSnapshots,
    createModuleWithCodeReservation,
    isCodeReserved,
    listCodes,
  };
}
