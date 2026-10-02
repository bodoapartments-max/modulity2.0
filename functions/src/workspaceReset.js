import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { PRESERVED_RESOURCES, RESET_MODES, WORKSPACE_RESET_RESOURCES } from './workspaceResetContract.js';

async function authorize(db, workspace, userId) {
  if (workspace.type === 'PERSONAL') {
    if (workspace.ownerUserId !== userId) throw new HttpsError('permission-denied', 'Only the Personal Workspace owner may reset it.');
    return 'PERSONAL_OWNER';
  }
  if (workspace.type !== 'ORGANIZATION' || !workspace.organizationId) throw new HttpsError('failed-precondition', 'Workspace type is not resettable.');
  const member = await db.doc(`organizations/${workspace.organizationId}/members/${userId}`).get();
  if (!member.exists || member.data().status !== 'ACTIVE' || !member.data().roles?.includes('OWNER')) throw new HttpsError('permission-denied', 'Only an active Organization OWNER may reset this Workspace.');
  return 'ORGANIZATION_OWNER';
}

async function estimateResource(db, workspaceId, resource) {
  const ref = db.collection(`workspaces/${workspaceId}/${resource.collection}`);
  const query = resource.strategy === 'DOMAIN_ONLY' ? ref.where('category', '==', 'DOMAIN') : ref;
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

export async function buildResetPlan(db, workspaceId, userId) {
  const workspaceRef = db.doc(`workspaces/${workspaceId}`);
  const workspaceSnapshot = await workspaceRef.get();
  if (!workspaceSnapshot.exists) throw new HttpsError('not-found', 'Workspace not found.');
  const workspace = workspaceSnapshot.data();
  const authority = await authorize(db, workspace, userId);
  const counts = await Promise.all(WORKSPACE_RESET_RESOURCES.map((resource) => estimateResource(db, workspaceId, resource)));
  return {
    workspaceId,
    workspaceName: workspace.name,
    workspaceType: workspace.type,
    requestedBy: userId,
    authority,
    mode: RESET_MODES.WORKSPACE_DATA_RESET,
    resources: WORKSPACE_RESET_RESOURCES.map((resource, index) => ({ ...resource, estimatedCount: counts[index] })),
    preserve: PRESERVED_RESOURCES,
    estimatedTotalDocuments: counts.reduce((sum, count) => sum + count, 0),
  };
}

async function deleteResource(db, workspaceId, resource) {
  const ref = db.collection(`workspaces/${workspaceId}/${resource.collection}`);
  if (resource.strategy === 'DOMAIN_ONLY') {
    const snapshot = await ref.where('category', '==', 'DOMAIN').get();
    await Promise.all(snapshot.docs.map((document) => db.recursiveDelete(document.ref)));
    return snapshot.size;
  }
  const count = await estimateResource(db, workspaceId, resource);
  await db.recursiveDelete(ref);
  return count;
}

export async function executeWorkspaceReset(db, { workspaceId, userId, requestId, confirmation }) {
  if (!requestId || typeof requestId !== 'string' || requestId.length > 128) throw new HttpsError('invalid-argument', 'A valid requestId is required.');
  const plan = await buildResetPlan(db, workspaceId, userId);
  if (confirmation !== plan.workspaceName) throw new HttpsError('failed-precondition', 'Workspace name confirmation does not match.');
  const operationRef = db.doc(`workspaceResetOperations/${workspaceId}`);
  const auditId = `reset_${randomUUID()}`;
  const lock = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(operationRef);
    if (current.exists) {
      const data = current.data();
      if (data.requestId === requestId && data.status === 'SUCCESS') return { completed: true, auditId: data.auditId };
      if (data.status === 'RUNNING') throw new HttpsError('already-exists', 'A Workspace reset is already running.');
    }
    transaction.set(operationRef, { workspaceId, requestId, auditId, requestedBy: userId, mode: plan.mode, status: 'RUNNING', startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { completed: false, auditId };
  });
  if (lock.completed) return { status: 'SUCCESS', idempotent: true, auditId: lock.auditId, workspaceId };

  const deletedCounts = {};
  try {
    for (const resource of WORKSPACE_RESET_RESOURCES) {
      deletedCounts[resource.resource] = await deleteResource(db, workspaceId, resource);
      await operationRef.update({ currentResource: resource.resource, updatedAt: FieldValue.serverTimestamp() });
    }
    await db.doc(`workspaces/${workspaceId}`).update({ dataGeneration: FieldValue.increment(1), lastResetAt: FieldValue.serverTimestamp(), lastResetBy: userId });
    await db.doc(`workspaceResetAudits/${auditId}`).set({ workspaceId, workspaceType: plan.workspaceType, requestedBy: userId, executedAt: FieldValue.serverTimestamp(), mode: plan.mode, result: 'SUCCESS', deletedCounts });
    await operationRef.set({ ...plan, requestId, auditId, status: 'SUCCESS', requestedBy: userId, deletedCounts, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { status: 'SUCCESS', idempotent: false, auditId, workspaceId, deletedCounts };
  } catch (error) {
    await db.doc(`workspaceResetAudits/${auditId}`).set({ workspaceId, workspaceType: plan.workspaceType, requestedBy: userId, executedAt: FieldValue.serverTimestamp(), mode: plan.mode, result: 'FAILED', errorCode: error.code || 'internal' });
    await operationRef.set({ workspaceId, requestId, auditId, requestedBy: userId, mode: plan.mode, status: 'FAILED', errorCode: error.code || 'internal', updatedAt: FieldValue.serverTimestamp() });
    throw error;
  }
}
