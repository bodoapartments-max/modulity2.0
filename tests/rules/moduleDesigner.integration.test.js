import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createEntityService } from '../../src/core/data/entityService.js';
import { createRecordService } from '../../src/core/data/recordService.js';
import { createModuleService } from '../../src/modules/moduleService.js';
import { createModuleSubmissionService } from '../../src/modules/moduleSubmissionService.js';
import { createRecordCommandLocalAdapter } from '../../src/infrastructure/recordCommandLocalAdapter.js';
import { createFirestoreEntityRepository } from '../../src/infrastructure/firebase/firestoreEntityRepository.js';
import { createFirestoreEntityTypeRepository } from '../../src/infrastructure/firebase/firestoreEntityTypeRepository.js';
import { createFirestoreModuleRepository } from '../../src/infrastructure/firebase/firestoreModuleRepository.js';
import { createFirestoreRecordRepository } from '../../src/infrastructure/firebase/firestoreRecordRepository.js';

let env;
const PROJECT_ID = 'modulity-module-designer-test';
const workspaceId = 'designer-workspace';
const owner = 'owner';
const actor = { actorType: 'USER', actorId: owner };

async function withPrivilegedDb(operation) {
  return env.withSecurityRulesDisabled(async (context) => operation(context.firestore()));
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync(resolve('firestore.rules'), 'utf8') } });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await withPrivilegedDb(async (db) => {
    await setDoc(doc(db, 'workspaces', workspaceId), { workspaceId, name: 'Designer Personal', type: 'PERSONAL', ownerUserId: owner });
    await setDoc(doc(db, 'workspaces', workspaceId, 'entityTypes', 'core:vehicle'), { typeId: 'core:vehicle', workspaceId, code: 'VEHICLE', name: 'Vehicle', category: 'CORE', status: 'ACTIVE', schemaVersion: '1.0.0', fields: [] });
    await setDoc(doc(db, 'workspaces', workspaceId, 'entityTypes', 'core:employee'), { typeId: 'core:employee', workspaceId, code: 'EMPLOYEE', name: 'Employee', category: 'CORE', status: 'ACTIVE', schemaVersion: '1.0.0', fields: [] });
    await setDoc(doc(db, 'workspaces', workspaceId, 'entities', 'vehicle-1'), { entityId: 'vehicle-1', workspaceId, entityTypeId: 'core:vehicle', displayName: 'ABC-123', status: 'ACTIVE', data: {}, createdBy: actor });
    await setDoc(doc(db, 'workspaces', workspaceId, 'entities', 'employee-1'), { entityId: 'employee-1', workspaceId, entityTypeId: 'core:employee', displayName: 'Anna Smith', status: 'ACTIVE', data: {}, createdBy: actor });
  });
});

describe('Module Designer canonical integration', () => {
  it('publishes Vehicle Inspection, preserves v1, creates v2, and stores canonical Records', async () => {
    await withPrivilegedDb(async (db) => {
      const moduleRepo = createFirestoreModuleRepository(db);
      const entityTypeRepo = createFirestoreEntityTypeRepository(db);
      const entityRepo = createFirestoreEntityRepository(db);
      const recordRepo = createFirestoreRecordRepository(db);
      const moduleService = createModuleService({ moduleRepo, entityTypeRepo });
      const entityService = createEntityService({ entityRepo, entityTypeRepo });
      const recordService = createRecordService({ recordRepo, entityRepo });
      const recordCommand = createRecordCommandLocalAdapter({ recordService, entityService, moduleRepo });
      const submission = createModuleSubmissionService({ moduleRepo, recordService, entityService, recordCommand });
      const fieldsV1 = [{ key: 'vehicle', label: 'Vehicle', type: 'entity-reference', entityTypeId: 'core:vehicle', required: true }, { key: 'inspector', label: 'Inspector', type: 'entity-reference', entityTypeId: 'core:employee', required: true }, { key: 'inspectionDate', label: 'Inspection Date', type: 'date', required: true }, { key: 'mileage', label: 'Mileage', type: 'number', required: true }, { key: 'result', label: 'Result', type: 'select', options: ['PASS', 'FAIL'], required: true }, { key: 'notes', label: 'Notes', type: 'textarea', required: false }];
      const created = await moduleService.createModule({ workspaceId, moduleCode: 'VEHICLE_INSPECTION', name: 'Vehicle Inspection', category: 'Fleet', formSchema: { schemaVersion: '1.0.0', fields: fieldsV1 }, displayConfig: { primaryField: 'vehicle', listFields: ['vehicle', 'inspectionDate', 'result'] }, createdBy: actor });
      await moduleService.activateModule(workspaceId, created.moduleId, actor);
      const refs = { vehicle: { entityId: 'vehicle-1', entityTypeId: 'core:vehicle', workspaceId }, inspector: { entityId: 'employee-1', entityTypeId: 'core:employee', workspaceId } };
      const first = await submission.submitModuleRecord({ workspaceId, moduleId: created.moduleId, actor, values: { ...refs, inspectionDate: '2026-10-10', mileage: 1000, result: 'PASS', notes: 'Initial inspection' } });
      const fieldsV2 = [...fieldsV1, { key: 'internalNotes', label: 'Internal Notes', type: 'textarea', required: false }];
      const updated = await moduleService.updateModule(workspaceId, created.moduleId, { formSchema: { schemaVersion: '1.0.0', fields: fieldsV2 }, displayConfig: { primaryField: 'vehicle', listFields: ['vehicle', 'inspectionDate', 'result', 'internalNotes'] } }, actor);
      const second = await submission.submitModuleRecord({ workspaceId, moduleId: created.moduleId, actor, values: { ...refs, inspectionDate: '2026-10-11', mileage: 1100, result: 'PASS', notes: 'Second inspection', internalNotes: 'Designer v2' } });
      expect(updated.version).toBe(2);
      expect(first.moduleVersion).toBe(1);
      expect(second.moduleVersion).toBe(2);
      expect(first.entityReferences.map((item) => item.entityId)).toEqual(['vehicle-1', 'employee-1']);
      const v1 = (await getDoc(doc(db, 'workspaces', workspaceId, 'modules', created.moduleId, 'versions', '1'))).data();
      const v2 = (await getDoc(doc(db, 'workspaces', workspaceId, 'modules', created.moduleId, 'versions', '2'))).data();
      expect(v1.formSchema.fields.map((field) => field.key)).not.toContain('internalNotes');
      expect(v2.formSchema.fields.map((field) => field.key)).toContain('internalNotes');
    });
  });
});
