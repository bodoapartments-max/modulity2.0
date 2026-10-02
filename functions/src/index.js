import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { buildResetPlan, executeWorkspaceReset } from './workspaceReset.js';

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
