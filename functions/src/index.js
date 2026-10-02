import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { buildResetPlan, executeWorkspaceReset } from './workspaceReset.js';
import { approveAutomatPlan, getAutomatPlan, persistAutomatPlan } from './automatPlanService.js';
import { applyAutomatPlan, getAutomatApplyOperation } from './automatApplyEngine.js';

initializeApp();
const db = getFirestore();

export const workspaceReset = onCall({ region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const { action, workspaceId, requestId, confirmation, mode = 'WORKSPACE_DATA_RESET' } = request.data || {};
  if (!workspaceId || typeof workspaceId !== 'string') throw new HttpsError('invalid-argument', 'workspaceId is required.');
  if (mode !== 'WORKSPACE_DATA_RESET') throw new HttpsError('unimplemented', 'Only WORKSPACE_DATA_RESET is implemented.');
  if (action === 'PLAN') return buildResetPlan(db, workspaceId, request.auth.uid);
  if (action === 'EXECUTE') return executeWorkspaceReset(db, { workspaceId, userId: request.auth.uid, requestId, confirmation });
  throw new HttpsError('invalid-argument', 'action must be PLAN or EXECUTE.');
});

export const automatPlan = onCall({ region: 'europe-west1', timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.', { code: 'UNAUTHENTICATED' });
  const { action, workspaceId, planId, plan, planningFingerprint, planFingerprint } = request.data || {};
  if (!workspaceId || typeof workspaceId !== 'string') throw new HttpsError('invalid-argument', 'workspaceId is required.');
  if (action === 'PERSIST') return persistAutomatPlan(db, { workspaceId, userId: request.auth.uid, plan, planningFingerprint });
  if (action === 'APPROVE') return approveAutomatPlan(db, { workspaceId, userId: request.auth.uid, planId, planFingerprint });
  if (action === 'GET') return getAutomatPlan(db, { workspaceId, userId: request.auth.uid, planId });
  throw new HttpsError('invalid-argument', 'action must be PERSIST, APPROVE, or GET.');
});

export const automatApplyPlan = onCall({ region: 'europe-west1', timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.', { code: 'UNAUTHENTICATED' });
  const { action, workspaceId, planId, operationId } = request.data || {};
  if (!workspaceId || typeof workspaceId !== 'string') throw new HttpsError('invalid-argument', 'workspaceId is required.');
  if (action === 'APPLY') return applyAutomatPlan(db, { workspaceId, userId: request.auth.uid, planId, operationId });
  if (action === 'STATUS') return getAutomatApplyOperation(db, { workspaceId, userId: request.auth.uid, operationId });
  throw new HttpsError('invalid-argument', 'action must be APPLY or STATUS.');
});
