/* eslint-disable no-undef */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { doc, setDoc } from 'firebase/firestore';
import { createWorksetService } from '../../src/core/workspace/worksetService.js';
import { createWidgetService, createNotificationService, createWorkspacePreferenceService } from '../../src/core/workspace/workspaceExperienceServices.js';
import { createConversationService } from '../../src/core/workspace/conversationService.js';
import { createEntityService } from '../../src/core/data/entityService.js';
import { createRecordService } from '../../src/core/data/recordService.js';
import { createModuleSubmissionService } from '../../src/modules/moduleSubmissionService.js';
import { createFirestoreEntityRepository } from '../../src/infrastructure/firebase/firestoreEntityRepository.js';
import { createFirestoreEntityTypeRepository } from '../../src/infrastructure/firebase/firestoreEntityTypeRepository.js';
import { createFirestoreRecordRepository } from '../../src/infrastructure/firebase/firestoreRecordRepository.js';
import { createFirestoreModuleRepository } from '../../src/infrastructure/firebase/firestoreModuleRepository.js';
import { createFirestoreConversationRepository } from '../../src/infrastructure/firebase/firestoreConversationRepository.js';
import {
  createFirestoreWorksetRepository, createFirestoreWidgetRepository,
  createFirestoreNotificationRepository, createFirestoreWorkspacePreferenceRepository,
} from '../../src/infrastructure/firebase/firestoreWorkspaceExperienceRepositories.js';

let testEnv;
const PROJECT_ID = 'modulity-workspace-experience-test';
const WS = 'journey-ws';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 } });
});
afterAll(async () => { if (testEnv) await testEnv.cleanup(); });
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'workspaces', WS), { workspaceId: WS, type: 'ORGANIZATION', organizationId: 'journey-org', ownerUserId: null, name: 'Field Services Demo' });
    await setDoc(doc(db, 'organizations', 'journey-org'), { organizationId: 'journey-org', name: 'Field Services Demo', type: 'COMPANY', createdByUserId: 'user1' });
    for (const userId of ['user1', 'user2']) {
      await setDoc(doc(db, 'users', userId), { userId, email: `${userId}@example.com`, displayName: userId });
      await setDoc(doc(db, 'organizations', 'journey-org', 'members', userId), { organizationId: 'journey-org', userId, status: 'ACTIVE', roles: userId === 'user1' ? ['OWNER'] : ['MEMBER'] });
    }
    await setDoc(doc(db, 'workspaces', WS, 'modules', 'module-1'), {
      moduleId: 'module-1', workspaceId: WS, moduleCode: 'SITE_REPORT', name: 'Site Report', status: 'ACTIVE', version: 1,
      createdBy: { actorType: 'USER', actorId: 'user1' }, numberingStrategy: 'NONE',
      formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'summary', label: 'Summary', type: 'text', required: true }] },
      recordConfig: { recordType: 'SITE_REPORT' },
    });
    await setDoc(doc(db, 'workspaces', WS, 'entityTypes', 'site'), {
      typeId: 'site', workspaceId: WS, code: 'SITE', name: 'Site', category: 'DOMAIN', status: 'ACTIVE', fields: [],
      createdBy: { actorType: 'USER', actorId: 'user1' },
    });
  });
});

describe('Step 7.2 workspace journey persistence', () => {
  it('connects Workset, preference, Widget, Notification, and Chat to one canonical workspace', async () => {
    const user1Db = testEnv.authenticatedContext('user1').firestore();
    const user2Db = testEnv.authenticatedContext('user2').firestore();
    const worksetRepo = createFirestoreWorksetRepository(user1Db);
    const worksetService = createWorksetService({ worksetRepo, moduleRepo: createFirestoreModuleRepository(user1Db) });
    const actor = { actorType: 'USER', actorId: 'user1' };
    const workset = await worksetService.create({ workspaceId: WS, name: 'Field Installation', moduleIds: ['module-1'], createdBy: actor });
    expect(workset.moduleIds).toEqual(['module-1']);

    const entityRepo = createFirestoreEntityRepository(user1Db);
    const entityService = createEntityService({ entityRepo, entityTypeRepo: createFirestoreEntityTypeRepository(user1Db) });
    const entity = await entityService.createEntity({ workspaceId: WS, entityTypeId: 'site', displayName: 'Site A', data: {}, createdBy: actor });
    expect(entity.entityTypeId).toBe('site');

    const recordRepo = createFirestoreRecordRepository(user1Db);
    const recordService = createRecordService({ recordRepo, entityRepo });
    const moduleSubmission = createModuleSubmissionService({ moduleRepo: createFirestoreModuleRepository(user1Db), recordService, entityService });
    const record = await moduleSubmission.submitModuleRecord({ workspaceId: WS, moduleId: 'module-1', actor, values: { summary: 'Installation complete' } });
    expect(record.moduleId).toBe('module-1');
    expect((await recordRepo.getById(WS, record.recordId)).data.summary).toBe('Installation complete');

    const preferenceService = createWorkspacePreferenceService({ preferenceRepo: createFirestoreWorkspacePreferenceRepository(user1Db), worksetRepo });
    expect((await preferenceService.setActiveWorkset(WS, 'user1', workset.worksetId)).activeWorksetId).toBe(workset.worksetId);

    const widgetService = createWidgetService({ widgetRepo: createFirestoreWidgetRepository(user1Db) });
    const widget = await widgetService.create({ workspaceId: WS, ownerUserId: 'user1', name: 'Recent Site Reports', type: 'RECENT_RECORDS', source: 'RECORDS', moduleId: 'module-1', filters: [], display: { limit: 5 }, createdBy: actor });
    expect(widget.moduleId).toBe('module-1');

    const notificationService = createNotificationService({ notificationRepo: createFirestoreNotificationRepository(user1Db) });
    await notificationService.create({ workspaceId: WS, recipientUserId: 'user2', type: 'RECORD_SENT', title: 'Record received', resourceType: 'RECORD', resourceId: 'record-1', actionUrl: '/app/records/record-1', createdBy: actor });
    const recipientNotifications = await createNotificationService({ notificationRepo: createFirestoreNotificationRepository(user2Db) }).listForUser(WS, 'user2');
    expect(recipientNotifications[0].resourceId).toBe('record-1');

    const conversationService = createConversationService({ conversationRepo: createFirestoreConversationRepository(user1Db) });
    const conversation = await conversationService.create({ workspaceId: WS, type: 'DIRECT', title: '', memberIds: ['user1', 'user2'], actor });
    await conversationService.sendMessage({ workspaceId: WS, conversationId: conversation.conversationId, senderUserId: 'user1', content: 'Site visit ready' });
    const user2ConversationService = createConversationService({ conversationRepo: createFirestoreConversationRepository(user2Db) });
    const messages = await user2ConversationService.listMessages(WS, conversation.conversationId, 'user2', { pageSize: 30 });
    expect(messages.items[0].content).toBe('Site visit ready');
  });
});
