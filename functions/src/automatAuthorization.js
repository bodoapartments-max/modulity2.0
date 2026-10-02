import { HttpsError } from 'firebase-functions/v2/https';

export async function authorizeAutomat(db, workspaceId, userId) {
  const snapshot = await db.doc(`workspaces/${workspaceId}`).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Workspace not found.');
  const workspace = snapshot.data();
  if (workspace.type === 'PERSONAL') {
    if (workspace.ownerUserId !== userId) throw new HttpsError('permission-denied', 'Only the Personal Workspace owner may use Automat application.');
    return { workspace, authority: 'PERSONAL_OWNER' };
  }
  if (workspace.type !== 'ORGANIZATION' || !workspace.organizationId) throw new HttpsError('failed-precondition', 'Workspace type is not supported.');
  const member = await db.doc(`organizations/${workspace.organizationId}/members/${userId}`).get();
  if (!member.exists || member.data().status !== 'ACTIVE' || !member.data().roles?.includes('OWNER')) throw new HttpsError('permission-denied', 'Only an active Organization OWNER may apply an Automat plan.');
  return { workspace, authority: 'ORGANIZATION_OWNER' };
}

export function assertAutomatEntitlement() {
  const env = globalThis.process?.env || {};
  const projectId = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT;
  if (projectId !== 'modulity-2-dev' && !env.FIRESTORE_EMULATOR_HOST) throw new HttpsError('failed-precondition', 'Automat system builder entitlement is unavailable.', { code: 'ENTITLEMENT_DENIED' });
  return { capability: 'automat.system_builder', source: 'DEVELOPMENT_PROJECT_GRANT' };
}
