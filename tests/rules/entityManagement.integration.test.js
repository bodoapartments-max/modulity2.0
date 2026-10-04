import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { doc, setDoc } from 'firebase/firestore';
import { createEntityService } from '../../src/core/data/entityService.js';
import { createFirestoreEntityRepository } from '../../src/infrastructure/firebase/firestoreEntityRepository.js';
import { createFirestoreEntityTypeRepository } from '../../src/infrastructure/firebase/firestoreEntityTypeRepository.js';

let env;
const PROJECT_ID = 'modulity-entity-management-test';
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync(resolve('firestore.rules'), 'utf8') } }); });
afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

async function seed(workspaceId = 'workspace-1', owner = 'owner') {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'workspaces', workspaceId), { workspaceId, name: 'Workspace', type: 'PERSONAL', ownerUserId: owner });
    await setDoc(doc(db, 'workspaces', workspaceId, 'entityTypes', 'room-type'), { typeId: 'room-type', workspaceId, code: 'ROOM', name: 'Room', category: 'DOMAIN', status: 'ACTIVE', schemaVersion: '1.0.0', fields: [{ key: 'roomNumber', label: 'Room Number', type: 'text', required: true }] });
  });
}

describe('generic Entity Management integration', () => {
  it('paginates deterministically and supports bounded prefix search', async () => {
    await seed();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (let index = 1; index <= 30; index += 1) {
        const value = String(index).padStart(3, '0');
        await setDoc(doc(db, 'workspaces', 'workspace-1', 'entities', `room-${value}`), { entityId: `room-${value}`, workspaceId: 'workspace-1', entityTypeId: 'room-type', displayName: `Room ${value}`, status: 'ACTIVE', data: { roomNumber: value }, createdBy: { actorType: 'USER', actorId: 'owner' } });
      }
    });
    const repo = createFirestoreEntityRepository(env.authenticatedContext('owner').firestore());
    const first = await repo.paginatedByType('workspace-1', 'room-type', { limit: 10 });
    const second = await repo.paginatedByType('workspace-1', 'room-type', { limit: 10, startAfter: first.nextCursor });
    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(10);
    expect(first.items[0].displayName).toBe('Room 001');
    expect(second.items[0].displayName).toBe('Room 011');
    expect(new Set([...first.items, ...second.items].map((item) => item.entityId)).size).toBe(20);
    const search = await repo.paginatedByType('workspace-1', 'room-type', { limit: 10, search: 'Room 02' });
    expect(search.items).toHaveLength(10);
    expect(search.items.every((item) => item.displayName.startsWith('Room 02'))).toBe(true);
  });

  it('creates and edits canonical Entities through the existing service', async () => {
    await seed();
    // Step 17.3 — entity mutations route through the trusted admin boundary.
    // In this emulator harness we simulate that boundary by executing the same
    // writes with securityRulesDisabled (equivalent to the Admin SDK context).
    const authDb = env.authenticatedContext('owner').firestore();
    const readRepo = createFirestoreEntityRepository(authDb);
    // withSecurityRulesDisabled contexts are per-scope; open one per command.
    const withServer = async (fn) => {
      let out;
      await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); });
      return out;
    };
    const adminExecutor = {
      async execute(commandType, payload) {
        return withServer(async (serverDb) => {
          const serverEntityRepo = createFirestoreEntityRepository(serverDb);
          if (commandType === 'CREATE_ENTITY') {
            const entity = { entityId: `ent_${Math.random().toString(36).slice(2, 10)}`, workspaceId: payload.workspaceId, entityTypeId: payload.entityTypeId, displayName: payload.name, data: payload.data || {}, status: 'ACTIVE', attachments: [], sourceRecordId: null, schemaVersion: '1.0.0', createdBy: { actorType: 'USER', actorId: 'owner' } };
            await serverEntityRepo.create(entity);
            return { result: { entityId: entity.entityId } };
          }
          if (commandType === 'UPDATE_ENTITY') {
            const changes = {};
            if (payload.displayName !== undefined) changes.displayName = payload.displayName;
            if (payload.data !== undefined) changes.data = payload.data;
            await serverEntityRepo.update(payload.workspaceId, payload.resourceId, changes);
            return { result: { entityId: payload.resourceId } };
          }
          throw new Error(`unexpected command ${commandType}`);
        });
      },
    };
    const service = createEntityService({ entityRepo: readRepo, entityTypeRepo: createFirestoreEntityTypeRepository(authDb), adminCommand: adminExecutor });
    const created = await service.createEntity({ workspaceId: 'workspace-1', entityTypeId: 'room-type', displayName: 'Room 101', data: { roomNumber: '101' }, createdBy: { actorType: 'USER', actorId: 'owner' } });
    const updated = await service.updateEntity('workspace-1', created.entityId, { displayName: 'Room 101A', data: { roomNumber: '101A' } }, { actorType: 'USER', actorId: 'owner' });
    expect(updated.displayName).toBe('Room 101A');
    expect(await readRepo.countByType('workspace-1', 'room-type')).toBe(1);
    expect((await readRepo.listByType('workspace-1', 'room-type')).map((item) => item.displayName)).toContain('Room 101A');
  });

  it('denies cross-Workspace Entity listing', async () => {
    await seed('workspace-1', 'owner');
    const repo = createFirestoreEntityRepository(env.authenticatedContext('outsider').firestore());
    await assertFails(repo.paginatedByType('workspace-1', 'room-type', { limit: 10 }));
  });
});
