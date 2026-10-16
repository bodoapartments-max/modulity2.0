/**
 * Modulity 2.0 — Firestore Approval Repository (Step 31)
 *
 * Read-side repository for canonical ApprovalCase and ApprovalDefinition
 * documents:
 *   workspaces/{workspaceId}/approvalCases/{caseId}
 *   workspaces/{workspaceId}/approvalDefinitions/{definitionId}
 *
 * Writes belong to the trusted approvalCommand boundary — this adapter is
 * read-only.
 *
 * @module infrastructure/firebase/firestoreApprovalRepository
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

const MAX_CASES = 100;

export function createFirestoreApprovalRepository(db) {
  function casesCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'approvalCases');
  }
  function definitionsCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'approvalDefinitions');
  }

  function mapCase(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      approvalCaseId: d.approvalCaseId || docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }
  function mapDefinition(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return { ...d, approvalDefinitionId: d.approvalDefinitionId || docSnap.id };
  }

  async function getCaseById(workspaceId, approvalCaseId) {
    return mapCase(await getDoc(doc(casesCol(workspaceId), approvalCaseId)));
  }

  async function listCasesBySubject(workspaceId, subjectType, subjectId) {
    const q = query(
      casesCol(workspaceId),
      where('subject.type', '==', subjectType),
      where('subject.id', '==', subjectId),
      orderBy('_createdAt', 'desc'),
      limit(MAX_CASES),
    );
    return (await getDocs(q)).docs.map(mapCase);
  }

  async function listCasesByRequester(workspaceId, requesterUserId) {
    const q = query(
      casesCol(workspaceId),
      where('requestedBy.actorId', '==', requesterUserId),
      orderBy('_createdAt', 'desc'),
      limit(MAX_CASES),
    );
    return (await getDocs(q)).docs.map(mapCase);
  }

  async function getDefinitionById(workspaceId, approvalDefinitionId) {
    return mapDefinition(await getDoc(doc(definitionsCol(workspaceId), approvalDefinitionId)));
  }

  async function listActiveDefinitions(workspaceId) {
    const q = query(
      definitionsCol(workspaceId),
      where('status', '==', 'ACTIVE'),
      orderBy('name', 'asc'),
      limit(100),
    );
    return (await getDocs(q)).docs.map(mapDefinition);
  }

  return Object.freeze({
    getCaseById,
    listCasesBySubject,
    listCasesByRequester,
    getDefinitionById,
    listActiveDefinitions,
  });
}
