import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { doc, setDoc } from 'firebase/firestore';
import { createRecordService } from '../../src/core/data/recordService.js';
import { createEntityService } from '../../src/core/data/entityService.js';
import { createModuleService } from '../../src/modules/moduleService.js';
import { createModuleSubmissionService } from '../../src/modules/moduleSubmissionService.js';
import { createRecordCommandLocalAdapter } from '../../src/infrastructure/recordCommandLocalAdapter.js';
import { createFirestoreEntityRepository } from '../../src/infrastructure/firebase/firestoreEntityRepository.js';
import { createFirestoreEntityTypeRepository } from '../../src/infrastructure/firebase/firestoreEntityTypeRepository.js';
import { createFirestoreModuleRepository } from '../../src/infrastructure/firebase/firestoreModuleRepository.js';
import { createFirestoreRecordRepository } from '../../src/infrastructure/firebase/firestoreRecordRepository.js';

let env;
const PROJECT_ID = 'modulity-record-command-test';
const WS = 'record-command-ws';
const ORG = 'record-command-org';
const OWNER = 'owner';
const MEMBER = 'member';
const actor = { actorType: 'USER', actorId: OWNER };

async function withPrivilegedDb(operation) {
  return env.withSecurityRulesDisabled(async (context) => operation(context.firestore()));
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve('firestore.rules'), 'utf8') },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await withPrivilegedDb(async (db) => {
    await setDoc(doc(db, 'workspaces', WS), { workspaceId: WS, name: 'Command Test', type: 'ORGANIZATION', organizationId: ORG, ownerUserId: null });
    await setDoc(doc(db, 'organizations', ORG), { organizationId: ORG, name: 'Command Test Org', type: 'COMPANY', createdByUserId: OWNER });
    for (const userId of [OWNER, MEMBER, 'outsider']) {
      await setDoc(doc(db, 'users', userId), { userId, email: `${userId}@example.com` });
    }
    await setDoc(doc(db, 'organizations', ORG, 'members', OWNER), { organizationId: ORG, userId: OWNER, status: 'ACTIVE', roles: ['OWNER'] });
    await setDoc(doc(db, 'organizations', ORG, 'members', MEMBER), { organizationId: ORG, userId: MEMBER, status: 'ACTIVE', roles: ['MEMBER'] });
    await setDoc(doc(db, 'organizations', ORG, 'members', 'outsider'), { organizationId: ORG, userId: 'outsider', status: 'LEFT', roles: ['MEMBER'] });
    await setDoc(doc(db, 'workspaces', WS, 'entityTypes', 'site'), { typeId: 'site', workspaceId: WS, code: 'SITE', name: 'Site', category: 'DOMAIN', status: 'ACTIVE', fields: [] });
    await setDoc(doc(db, 'workspaces', WS, 'entities', 'site-1'), { entityId: 'site-1', workspaceId: WS, entityTypeId: 'site', displayName: 'Site A', status: 'ACTIVE', data: {}, createdBy: actor });
    await setDoc(doc(db, 'workspaces', WS, 'modules', 'module-1'), {
      moduleId: 'module-1', workspaceId: WS, moduleCode: 'SITE_REPORT', name: 'Site Report', status: 'ACTIVE', version: 1,
      createdBy: actor,
      formSchema: { schemaVersion: '1.0.0', fields: [
        { key: 'summary', label: 'Summary', type: 'text', required: true },
        { key: 'site', label: 'Site', type: 'entity-reference', entityTypeId: 'site', required: false },
      ] },
      recordConfig: { recordType: 'SITE_REPORT' },
    });
  });
});

function createTestServices(db) {
  const moduleRepo = createFirestoreModuleRepository(db);
  const entityTypeRepo = createFirestoreEntityTypeRepository(db);
  const entityRepo = createFirestoreEntityRepository(db);
  const recordRepo = createFirestoreRecordRepository(db);
  const moduleService = createModuleService({ moduleRepo, entityTypeRepo });
  const entityService = createEntityService({ entityRepo, entityTypeRepo });
  const recordService = createRecordService({ recordRepo, entityRepo });
  const recordCommand = createRecordCommandLocalAdapter({ recordService, entityService, moduleRepo });
  const moduleSubmission = createModuleSubmissionService({ moduleRepo, recordService, entityService, recordCommand });
  return { moduleService, entityService, recordService, moduleSubmission, recordRepo };
}

describe('Trusted Record command integration', () => {
  it('creates a canonical Record through the command adapter', async () => {
    await withPrivilegedDb(async (db) => {
      const { moduleSubmission, recordRepo } = createTestServices(db);
      const record = await moduleSubmission.submitModuleRecord({ workspaceId: WS, moduleId: 'module-1', actor, values: { summary: 'Installed' } });
      expect(record.moduleId).toBe('module-1');
      expect(record.moduleVersion).toBe(1);
      expect(record.recordType).toBe('SITE_REPORT');
      expect(record.status).toBe('SUBMITTED');
      expect(record.createdBy.actorId).toBe(OWNER);
      const stored = await recordRepo.getById(WS, record.recordId);
      expect(stored.data.summary).toBe('Installed');
    });
  });

  it('resolves and validates EntityReference server-side', async () => {
    await withPrivilegedDb(async (db) => {
      const { moduleSubmission } = createTestServices(db);
      const record = await moduleSubmission.submitModuleRecord({
        workspaceId: WS,
        moduleId: 'module-1',
        actor,
        values: { summary: 'Installed', site: { entityId: 'site-1', entityTypeId: 'site', workspaceId: WS } },
      });
      expect(record.entityReferences[0].entityId).toBe('site-1');
    });
  });

  it('rejects a forged cross-workspace EntityReference', async () => {
    await withPrivilegedDb(async (db) => {
      const { moduleSubmission } = createTestServices(db);
      await expect(moduleSubmission.submitModuleRecord({
        workspaceId: WS,
        moduleId: 'module-1',
        actor,
        values: { summary: 'Installed', site: { entityId: 'site-1', entityTypeId: 'site', workspaceId: 'ws-other' } },
      })).rejects.toThrow();
    });
  });

  it('rejects a wrong entity type reference', async () => {
    await withPrivilegedDb(async (db) => {
      const { moduleSubmission } = createTestServices(db);
      await expect(moduleSubmission.submitModuleRecord({
        workspaceId: WS,
        moduleId: 'module-1',
        actor,
        values: { summary: 'Installed', site: { entityId: 'site-1', entityTypeId: 'wrong-type', workspaceId: WS } },
      })).rejects.toThrow();
    });
  });

  it('rejects missing required fields', async () => {
    await withPrivilegedDb(async (db) => {
      const { moduleSubmission } = createTestServices(db);
      await expect(moduleSubmission.submitModuleRecord({ workspaceId: WS, moduleId: 'module-1', actor, values: {} }))
        .rejects.toThrow();
    });
  });

  it('rejects unknown module', async () => {
    await withPrivilegedDb(async (db) => {
      const { moduleSubmission } = createTestServices(db);
      await expect(moduleSubmission.submitModuleRecord({ workspaceId: WS, moduleId: 'missing', actor, values: { summary: 'X' } }))
        .rejects.toThrow();
    });
  });

  it('rejects archived module', async () => {
    await withPrivilegedDb(async (db) => {
      const { moduleService, moduleSubmission } = createTestServices(db);
      await moduleService.archiveModule(WS, 'module-1', actor);
      await expect(moduleSubmission.submitModuleRecord({ workspaceId: WS, moduleId: 'module-1', actor, values: { summary: 'X' } }))
        .rejects.toThrow();
    });
  });

  it('rejects DRAFT Module submission', async () => {
    await withPrivilegedDb(async (db) => {
      const { moduleService, moduleSubmission } = createTestServices(db);
      await moduleService.updateModule(WS, 'module-1', { status: 'DRAFT' }, actor);
      await expect(moduleSubmission.submitModuleRecord({ workspaceId: WS, moduleId: 'module-1', actor, values: { summary: 'X' } }))
        .rejects.toThrow();
    });
  });
});
