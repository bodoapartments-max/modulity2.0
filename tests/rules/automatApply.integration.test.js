import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp } from '../../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore } from '../../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { createSystemPlanningOrchestrator } from '../../src/agents/planning/systemPlanningOrchestrator.js';
import { applyAutomatPlan, getAutomatApplyOperation } from '../../functions/src/automatApplyEngine.js';
import { approveAutomatPlan, persistAutomatPlan } from '../../functions/src/automatPlanService.js';
import { configurationFingerprint, loadAdminWorkspaceSnapshot } from '../../functions/src/automatSnapshot.js';
import { CORE_ENTITY_TYPES } from '../../src/core/data/coreEntityTypes.js';

let app;
let db;
const PROJECT_ID = 'modulity-automat-apply-test';
const hotelDescription = 'I run a 40-room hotel with a restaurant, parking area, maintenance team and 18 employees.';

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID }, 'automat-apply-tests');
  db = getFirestore(app);
});
afterAll(async () => deleteApp(app));
beforeEach(async () => {
  const collections = await db.listCollections();
  await Promise.all(collections.map((collection) => db.recursiveDelete(collection)));
});

async function seedWorkspace({ workspaceId = 'hotel-workspace', type = 'ORGANIZATION', owner = 'owner', organizationId = 'hotel-org' } = {}) {
  await db.doc(`users/${owner}`).set({ userId: owner });
  await db.doc(`workspaces/${workspaceId}`).set({ workspaceId, name: 'Reset Test Hotel', type, ownerUserId: type === 'PERSONAL' ? owner : null, organizationId: type === 'ORGANIZATION' ? organizationId : null });
  if (type === 'ORGANIZATION') {
    await db.doc(`organizations/${organizationId}`).set({ organizationId, name: 'Reset Test Hotel' });
    await db.doc(`organizations/${organizationId}/members/${owner}`).set({ userId: owner, organizationId, status: 'ACTIVE', roles: ['OWNER'] });
    await db.doc(`organizations/${organizationId}/members/member`).set({ userId: 'member', organizationId, status: 'ACTIVE', roles: ['MEMBER'] });
  }
}

async function generatePlan(workspaceId = 'hotel-workspace', requestId = 'request-1') {
  const snapshot = await loadAdminWorkspaceSnapshot(db, workspaceId);
  const organizationInput = { schemaVersion: '1.0.0', workspaceId, organizationName: 'Reset Test Hotel', description: '', userDescription: hotelDescription, existingConfiguration: snapshot };
  const result = await createSystemPlanningOrchestrator().plan({ requestId, workspaceId, requestedBy: 'owner', organizationInput, snapshot });
  return { ...result, configurationFingerprint: await configurationFingerprint(db, workspaceId) };
}

async function seedCoreEntityTypes(workspaceId = 'hotel-workspace') {
  await Promise.all(CORE_ENTITY_TYPES.map((item) => db.doc(`workspaces/${workspaceId}/entityTypes/${item.typeId}`).set({ ...item, workspaceId })));
}

async function generateEvolutionPlan(businessRequest, requestId, workspaceId = 'hotel-workspace') {
  const snapshot = await loadAdminWorkspaceSnapshot(db, workspaceId);
  const result = await createSystemPlanningOrchestrator().evolve({ requestId, workspaceId, requestedBy: 'owner', businessRequest, snapshot });
  return { ...result, configurationFingerprint: await configurationFingerprint(db, workspaceId) };
}

async function persistApprove(planResult, workspaceId = 'hotel-workspace') {
  const persisted = await persistAutomatPlan(db, { workspaceId, userId: 'owner', plan: planResult.plan, planningFingerprint: planResult.configurationFingerprint });
  const approved = await approveAutomatPlan(db, { workspaceId, userId: 'owner', planId: persisted.planId, planFingerprint: persisted.planFingerprint });
  return approved;
}

describe('trusted Automat BuildPlan application', () => {
  it('applies canonical hotel configuration in dependency order and verifies resources', async () => {
    await seedWorkspace();
    const generated = await generatePlan();
    const approved = await persistApprove(generated);
    const result = await applyAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', planId: approved.planId, operationId: 'operation-1' });
    expect(result.status).toBe('APPLIED');
    expect((await db.collection('workspaces/hotel-workspace/entityTypes').where('code', '==', 'ROOM').get()).size).toBe(1);
    const modules = await db.collection('workspaces/hotel-workspace/modules').get();
    expect(modules.size).toBe(4);
    for (const moduleDocument of modules.docs) expect((await moduleDocument.ref.collection('versions').doc('1').get()).exists).toBe(true);
    expect((await db.collection('workspaces/hotel-workspace/worksets').get()).size).toBe(3);
    expect((await db.collection('workspaces/hotel-workspace/widgetDefinitions').get()).size).toBe(3);
    expect((await db.collection('workspaces/hotel-workspace/reportDefinitions').get()).size).toBe(3);
    expect((await db.doc('workspaces/hotel-workspace/auditEntries/automat_operation-1').get()).exists).toBe(true);
    expect((await db.doc('automatApplyAudits/operation-1').get()).exists).toBe(true);
    expect((await db.doc('workspaces/hotel-workspace/notifications/automat_operation-1').get()).exists).toBe(true);
  });

  it('reuses equivalent configuration and same successful operation idempotently', async () => {
    await seedWorkspace();
    const first = await persistApprove(await generatePlan('hotel-workspace', 'request-first'));
    await applyAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', planId: first.planId, operationId: 'operation-first' });
    const counts = { modules: (await db.collection('workspaces/hotel-workspace/modules').get()).size, entityTypes: (await db.collection('workspaces/hotel-workspace/entityTypes').get()).size };
    const secondGenerated = await generatePlan('hotel-workspace', 'request-second');
    expect(secondGenerated.validation.classifications).toEqual(expect.arrayContaining([expect.objectContaining({ ref: 'entityType:ROOM', operation: 'REUSE' }), expect.objectContaining({ ref: 'module:RESERVATION', operation: 'REUSE' })]));
    const second = await persistApprove(secondGenerated);
    const applied = await applyAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', planId: second.planId, operationId: 'operation-second' });
    expect(applied.resourceResults.filter((item) => item.action === 'REUSED').length).toBeGreaterThan(5);
    const retry = await applyAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', planId: second.planId, operationId: 'operation-second' });
    expect(retry.idempotent).toBe(true);
    expect((await db.collection('workspaces/hotel-workspace/modules').get()).size).toBe(counts.modules);
    expect((await db.collection('workspaces/hotel-workspace/entityTypes').get()).size).toBe(counts.entityTypes);
  });

  it('applies and safely repeats a Workspace Architect restaurant evolution', async () => {
    await seedWorkspace();
    await seedCoreEntityTypes();
    const baseline = await persistApprove(await generatePlan('hotel-workspace', 'request-baseline'));
    await applyAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', planId: baseline.planId, operationId: 'operation-baseline' });
    const request = 'We opened a restaurant inside the hotel. Add table reservations, customer orders, suppliers and inventory.';
    const firstGenerated = await generateEvolutionPlan(request, 'request-restaurant-first');
    expect(firstGenerated.validation.classifications).toEqual(expect.arrayContaining([expect.objectContaining({ ref: 'entityType:EMPLOYEE', operation: 'REUSE' }), expect.objectContaining({ ref: 'entityType:TABLE', operation: 'CREATE' }), expect.objectContaining({ ref: 'module:CUSTOMER_ORDER', operation: 'CREATE' })]));
    const first = await persistApprove(firstGenerated);
    const applied = await applyAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', planId: first.planId, operationId: 'operation-restaurant-first' });
    expect(applied.status).toBe('APPLIED');
    expect((await db.collection('workspaces/hotel-workspace/entityTypes').where('code', 'in', ['TABLE', 'PRODUCT', 'STORAGE_LOCATION']).get()).size).toBe(3);
    expect((await db.collection('workspaces/hotel-workspace/entities').get()).size).toBe(0);
    const counts = { entityTypes: (await db.collection('workspaces/hotel-workspace/entityTypes').get()).size, modules: (await db.collection('workspaces/hotel-workspace/modules').get()).size };
    const repeatedGenerated = await generateEvolutionPlan(request, 'request-restaurant-repeat');
    expect(repeatedGenerated.validation.status).toBe('VALID');
    expect(repeatedGenerated.validation.classifications.every((item) => item.operation === 'REUSE')).toBe(true);
    const repeated = await persistApprove(repeatedGenerated);
    await applyAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', planId: repeated.planId, operationId: 'operation-restaurant-repeat' });
    expect((await db.collection('workspaces/hotel-workspace/entityTypes').get()).size).toBe(counts.entityTypes);
    expect((await db.collection('workspaces/hotel-workspace/modules').get()).size).toBe(counts.modules);
  });

  it('rejects stale plans and incompatible conflicts without writes', async () => {
    await seedWorkspace();
    const generated = await generatePlan();
    const approved = await persistApprove(generated);
    await db.doc('workspaces/hotel-workspace/modules/manual').set({ moduleId: 'manual', workspaceId: 'hotel-workspace', moduleCode: 'MANUAL', formSchema: { schemaVersion: '1.0.0', fields: [] } });
    await expect(applyAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', planId: approved.planId, operationId: 'operation-stale' })).rejects.toMatchObject({ details: expect.objectContaining({ code: 'STALE_PLAN' }) });
    expect((await db.collection('workspaces/hotel-workspace/entityTypes').where('code', '==', 'ROOM').get()).empty).toBe(true);
    await db.doc('workspaces/hotel-workspace/modules/manual').delete();
    await db.doc('workspaces/hotel-workspace/modules/conflict').set({ moduleId: 'conflict', workspaceId: 'hotel-workspace', moduleCode: 'RESERVATION', formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'different', label: 'Different', type: 'text', required: true }] } });
    const conflictPlan = await generatePlan('hotel-workspace', 'request-conflict');
    expect(conflictPlan.validation.status).toBe('INVALID');
    await expect(persistAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', plan: conflictPlan.plan, planningFingerprint: conflictPlan.configurationFingerprint })).rejects.toMatchObject({ details: expect.objectContaining({ code: 'PLAN_INVALID' }) });
  });

  it('journals partial failure and resumes without duplicates', async () => {
    await seedWorkspace();
    const approved = await persistApprove(await generatePlan());
    await expect(applyAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', planId: approved.planId, operationId: 'operation-resume' }, { failAfterPhase: 'MODULES' })).rejects.toMatchObject({ details: expect.objectContaining({ code: 'PARTIAL_FAILURE' }) });
    const partial = await getAutomatApplyOperation(db, { workspaceId: 'hotel-workspace', userId: 'owner', operationId: 'operation-resume' });
    expect(partial.status).toBe('PARTIAL_FAILED');
    expect((await db.collection('workspaces/hotel-workspace/modules').get()).size).toBe(4);
    const resumed = await applyAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', planId: approved.planId, operationId: 'operation-resume' });
    expect(resumed.status).toBe('APPLIED');
    expect((await db.collection('workspaces/hotel-workspace/modules').get()).size).toBe(4);
  });

  it('enforces OWNER/Personal-owner authority and rejects MEMBER/cross-Workspace callers', async () => {
    await seedWorkspace();
    const generated = await generatePlan();
    await expect(persistAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'member', plan: generated.plan, planningFingerprint: generated.configurationFingerprint })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(persistAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'outsider', plan: generated.plan, planningFingerprint: generated.configurationFingerprint })).rejects.toMatchObject({ code: 'permission-denied' });
    await seedWorkspace({ workspaceId: 'personal-owner', type: 'PERSONAL', owner: 'personal-user', organizationId: null });
    const personalSnapshot = await loadAdminWorkspaceSnapshot(db, 'personal-owner');
    const personalInput = { schemaVersion: '1.0.0', workspaceId: 'personal-owner', organizationName: 'Personal', description: '', userDescription: 'I manage a private school with students and teachers.', existingConfiguration: personalSnapshot };
    const personalPlan = await createSystemPlanningOrchestrator().plan({ requestId: 'personal-request', workspaceId: 'personal-owner', requestedBy: 'personal-user', organizationInput: personalInput, snapshot: personalSnapshot });
    const personalFingerprint = await configurationFingerprint(db, 'personal-owner');
    const persisted = await persistAutomatPlan(db, { workspaceId: 'personal-owner', userId: 'personal-user', plan: personalPlan.plan, planningFingerprint: personalFingerprint });
    expect(persisted.status).toBe('READY_FOR_REVIEW');
  });

  it('allows one active Workspace apply and converges duplicate requests', async () => {
    await seedWorkspace();
    const approved = await persistApprove(await generatePlan());
    const requests = await Promise.allSettled(Array.from({ length: 10 }, () => applyAutomatPlan(db, { workspaceId: 'hotel-workspace', userId: 'owner', planId: approved.planId, operationId: 'operation-concurrent' })));
    expect(requests.some((item) => item.status === 'fulfilled' && item.value.status === 'APPLIED')).toBe(true);
    expect((await db.collection('workspaces/hotel-workspace/modules').get()).size).toBe(4);
    expect((await db.doc('automatApplyOperations/operation-concurrent').get()).data().status).toBe('APPLIED');
  });
});
