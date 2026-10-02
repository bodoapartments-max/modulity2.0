import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp } from '../../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore } from '../../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { buildResetPlan, executeWorkspaceReset } from '../../functions/src/workspaceReset.js';
import { WORKSPACE_RESET_RESOURCES } from '../../functions/src/workspaceResetContract.js';

let app;
let db;
const PROJECT_ID = 'modulity-reset-integration-test';

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID }, 'workspace-reset-tests');
  db = getFirestore(app);
});
afterAll(async () => deleteApp(app));
beforeEach(async () => {
  const collections = await db.listCollections();
  await Promise.all(collections.map((collection) => db.recursiveDelete(collection)));
});

async function seedWorkspace(workspaceId, { type = 'PERSONAL', owner = 'owner', organizationId = null } = {}) {
  await db.doc(`users/${owner}`).set({ userId: owner, email: `${owner}@example.com` });
  await db.doc(`workspaces/${workspaceId}`).set({ workspaceId, name: workspaceId, type, ownerUserId: type === 'PERSONAL' ? owner : null, organizationId });
  if (type === 'ORGANIZATION') {
    await db.doc(`organizations/${organizationId}`).set({ organizationId, name: 'Test Hotel', createdByUserId: owner });
    await db.doc(`organizations/${organizationId}/members/${owner}`).set({ organizationId, userId: owner, status: 'ACTIVE', roles: ['OWNER'] });
    await db.doc(`organizations/${organizationId}/members/member`).set({ organizationId, userId: 'member', status: 'ACTIVE', roles: ['MEMBER'] });
  }
  await db.doc(`workspaces/${workspaceId}/entityTypes/core-room`).set({ typeId: 'core-room', category: 'CORE', name: 'Core Room' });
  await db.doc(`workspaces/${workspaceId}/entityTypes/room`).set({ typeId: 'room', category: 'DOMAIN', name: 'Room' });
  for (const resource of WORKSPACE_RESET_RESOURCES.filter((item) => !['domainEntityTypes'].includes(item.resource))) {
    await db.doc(`workspaces/${workspaceId}/${resource.collection}/fixture`).set({ workspaceId, fixture: true });
  }
  await db.doc(`workspaces/${workspaceId}/modules/fixture/versions/1`).set({ version: 1 });
  await db.doc(`workspaces/${workspaceId}/folders/fixture/items/item`).set({ itemId: 'item' });
  await db.doc(`workspaces/${workspaceId}/conversations/fixture/members/${owner}`).set({ userId: owner });
  await db.doc(`workspaces/${workspaceId}/conversations/fixture/messages/message`).set({ content: 'hello' });
  await db.doc(`workspaces/${workspaceId}/ledgerBooks/fixture/blocks/block_1`).set({ blockNumber: 1 });
}

async function assertWorkspaceEmpty(workspaceId) {
  for (const resource of WORKSPACE_RESET_RESOURCES.filter((item) => item.strategy !== 'DOMAIN_ONLY')) {
    expect((await db.collection(`workspaces/${workspaceId}/${resource.collection}`).limit(1).get()).empty, resource.resource).toBe(true);
  }
  expect((await db.collection(`workspaces/${workspaceId}/entityTypes`).where('category', '==', 'DOMAIN').get()).empty).toBe(true);
  expect((await db.doc(`workspaces/${workspaceId}/entityTypes/core-room`).get()).exists).toBe(true);
}

describe('trusted Workspace reset', () => {
  it('resets a Personal Workspace idempotently while preserving User and Workspace', async () => {
    await seedWorkspace('personal-owner');
    const plan = await buildResetPlan(db, 'personal-owner', 'owner');
    expect(plan.mode).toBe('WORKSPACE_DATA_RESET');
    expect(plan.preserve).toContain('workspaceDocument');
    await db.doc('workspaceAutomatOperations/personal-owner').set({ status: 'APPLIED', operationId: 'old-operation' });
    const first = await executeWorkspaceReset(db, { workspaceId: 'personal-owner', userId: 'owner', requestId: 'req-1', confirmation: 'personal-owner' });
    expect(first.status).toBe('SUCCESS');
    await assertWorkspaceEmpty('personal-owner');
    expect((await db.doc('users/owner').get()).exists).toBe(true);
    expect((await db.doc('workspaces/personal-owner').get()).exists).toBe(true);
    expect((await db.doc('workspaceAutomatOperations/personal-owner').get()).exists).toBe(false);
    const retry = await executeWorkspaceReset(db, { workspaceId: 'personal-owner', userId: 'owner', requestId: 'req-1', confirmation: 'personal-owner' });
    expect(retry.idempotent).toBe(true);
    expect((await db.doc(`workspaceResetAudits/${first.auditId}`).get()).exists).toBe(true);
  });

  it('allows Organization OWNER, denies MEMBER, and preserves Organization/Memberships', async () => {
    await seedWorkspace('hotel', { type: 'ORGANIZATION', owner: 'owner', organizationId: 'hotel-org' });
    await expect(executeWorkspaceReset(db, { workspaceId: 'hotel', userId: 'member', requestId: 'member-request', confirmation: 'hotel' })).rejects.toMatchObject({ code: 'permission-denied' });
    await executeWorkspaceReset(db, { workspaceId: 'hotel', userId: 'owner', requestId: 'owner-request', confirmation: 'hotel' });
    await assertWorkspaceEmpty('hotel');
    expect((await db.doc('organizations/hotel-org').get()).exists).toBe(true);
    expect((await db.doc('organizations/hotel-org/members/owner').get()).exists).toBe(true);
  });

  it('resets only the selected Workspace and remains usable afterward', async () => {
    await seedWorkspace('workspace-a');
    await seedWorkspace('workspace-b');
    const beforeB = (await db.doc('workspaces/workspace-b/modules/fixture').get()).data();
    await executeWorkspaceReset(db, { workspaceId: 'workspace-a', userId: 'owner', requestId: 'isolation', confirmation: 'workspace-a' });
    await assertWorkspaceEmpty('workspace-a');
    expect((await db.doc('workspaces/workspace-b/modules/fixture').get()).data()).toEqual(beforeB);
    await db.doc('workspaces/workspace-a/modules/new-module').set({ moduleId: 'new-module', workspaceId: 'workspace-a' });
    await db.doc('workspaces/workspace-a/records/new-record').set({ recordId: 'new-record', workspaceId: 'workspace-a' });
    expect((await db.doc('workspaces/workspace-a/records/new-record').get()).exists).toBe(true);
  });

  it('rejects reset while trusted Automat apply is active', async () => {
    await seedWorkspace('apply-active');
    await db.doc('workspaceAutomatOperations/apply-active').set({ status: 'APPLYING', operationId: 'operation-active' });
    await expect(executeWorkspaceReset(db, { workspaceId: 'apply-active', userId: 'owner', requestId: 'reset-active', confirmation: 'apply-active' })).rejects.toMatchObject({ code: 'already-exists' });
    expect((await db.doc('workspaces/apply-active/modules/fixture').get()).exists).toBe(true);
  });

  it('rejects wrong confirmation and concurrent duplicate reset requests', async () => {
    await seedWorkspace('concurrent');
    await expect(executeWorkspaceReset(db, { workspaceId: 'concurrent', userId: 'owner', requestId: 'wrong', confirmation: 'RESET' })).rejects.toMatchObject({ code: 'failed-precondition' });
    const results = await Promise.allSettled([
      executeWorkspaceReset(db, { workspaceId: 'concurrent', userId: 'owner', requestId: 'one', confirmation: 'concurrent' }),
      executeWorkspaceReset(db, { workspaceId: 'concurrent', userId: 'owner', requestId: 'two', confirmation: 'concurrent' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    expect(results.every((result) => result.status === 'fulfilled' || result.reason?.code === 'already-exists')).toBe(true);
    await assertWorkspaceEmpty('concurrent');
  });
});
