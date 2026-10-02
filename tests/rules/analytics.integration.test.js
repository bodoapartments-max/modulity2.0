/* eslint-disable no-undef */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { createAnalyticsExecutionService } from '../../src/core/analytics/analyticsExecutionService.js';
import { createReportService } from '../../src/core/analytics/reportService.js';
import { createWidgetExecutionService } from '../../src/core/analytics/widgetExecutionService.js';
import { createWidgetService } from '../../src/core/workspace/workspaceExperienceServices.js';
import { createFirestoreReportRepository } from '../../src/infrastructure/firebase/firestoreReportRepository.js';
import { createFirestoreRecordRepository } from '../../src/infrastructure/firebase/firestoreRecordRepository.js';
import { createFirestoreModuleRepository } from '../../src/infrastructure/firebase/firestoreModuleRepository.js';
import { createFirestoreEntityRepository } from '../../src/infrastructure/firebase/firestoreEntityRepository.js';
import { createFirestoreRelationshipRepository } from '../../src/infrastructure/firebase/firestoreRelationshipRepository.js';
import { createFirestoreWidgetRepository } from '../../src/infrastructure/firebase/firestoreWorkspaceExperienceRepositories.js';

let testEnv;
const PROJECT_ID = 'modulity-analytics-integration-test';
const WS = 'analytics-ws';
const actor = { actorType: 'USER', actorId: 'user1' };
const modules = [
  ['hotel', 'Hotel Expense'], ['parking', 'Parking Expense'], ['meal', 'Meal Expense'],
];
const amountRef = { scope: 'DATA', field: 'amount', type: 'number', label: 'Amount' };

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 } });
});
afterAll(async () => { if (testEnv) await testEnv.cleanup(); });
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'user1'), { userId: 'user1', email: 'user1@example.com' });
    await setDoc(doc(db, 'workspaces', WS), { workspaceId: WS, type: 'PERSONAL', ownerUserId: 'user1', name: 'Travel' });
    for (const [moduleId, name] of modules) await setDoc(doc(db, 'workspaces', WS, 'modules', moduleId), {
      moduleId, workspaceId: WS, moduleCode: moduleId.toUpperCase(), name, status: 'ACTIVE', version: 1,
      formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'amount', label: 'Amount', type: 'number', required: true }] },
      recordConfig: { recordType: moduleId.toUpperCase() }, createdBy: actor,
    });
    for (const [index, [moduleId, amount]] of [['hotel', 300], ['parking', 40], ['meal', 60]].entries()) await setDoc(doc(db, 'workspaces', WS, 'records', `record-${index}`), {
      recordId: `record-${index}`, workspaceId: WS, moduleId, moduleVersion: 1, recordType: moduleId.toUpperCase(), status: 'SUBMITTED', priority: 'NORMAL',
      data: { amount }, entityReferences: [], entityReferenceIds: [], attachments: [], createdBy: actor, submittedBy: actor,
      sourceRequestId: null, ledgerEntryId: null, ledgerBookId: null, referenceNumber: null, _createdAt: new Date(2026, 8, index + 1), _updatedAt: new Date(2026, 8, index + 1),
    });
  });
});

function createServices(db) {
  const moduleRepo = createFirestoreModuleRepository(db);
  const analyticsExecution = createAnalyticsExecutionService({
    recordRepo: createFirestoreRecordRepository(db), moduleRepo,
    entityRepo: createFirestoreEntityRepository(db), relationshipRepo: createFirestoreRelationshipRepository(db),
  });
  return {
    analyticsExecution,
    report: createReportService({ reportRepo: createFirestoreReportRepository(db), analyticsExecutionService: analyticsExecution, moduleRepo }),
    widget: createWidgetService({ widgetRepo: createFirestoreWidgetRepository(db) }),
    widgetExecution: createWidgetExecutionService({ analyticsExecutionService: analyticsExecution }),
  };
}

function reportParams() {
  return {
    workspaceId: WS, name: 'Travel Summary', description: '', createdBy: actor,
    dataSources: modules.map(([moduleId]) => ({ sourceType: 'RECORDS', moduleId })), filters: [], datePeriod: null, groupBy: [],
    metrics: [{ type: 'COUNT', fieldRef: null, key: 'count' }, { type: 'SUM', fieldRef: amountRef, key: 'total' }],
    columns: [{ scope: 'SYSTEM', field: 'moduleId', type: 'text', label: 'Module' }, amountRef], sort: [], visualization: { type: 'TABLE' },
  };
}

describe('Step 8 canonical analytics integration', () => {
  it('executes Report and Widget from the same Records and refreshes after mutation without result copies', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    const services = createServices(db);
    const report = await services.report.create(reportParams());
    const first = await services.report.execute(WS, report.reportId);
    expect(first.summary).toEqual({ count: 3, total: 400 });
    expect(new Set(first.rows.map((row) => row.moduleId))).toEqual(new Set(['hotel', 'parking', 'meal']));

    const widget = await services.widget.create({
      workspaceId: WS, ownerUserId: 'user1', name: 'Total Travel Expense', type: 'KPI', source: 'RECORDS', moduleIds: ['hotel', 'parking', 'meal'],
      filters: [], metric: 'SUM', metricField: amountRef, columns: [], display: { limit: 10 }, createdBy: actor,
    });
    expect((await services.widgetExecution.execute(widget)).value).toBe(400);

    await testEnv.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'workspaces', WS, 'records', 'record-3'), {
      recordId: 'record-3', workspaceId: WS, moduleId: 'hotel', moduleVersion: 1, recordType: 'HOTEL', status: 'SUBMITTED', priority: 'NORMAL', data: { amount: 100 },
      entityReferences: [], entityReferenceIds: [], attachments: [], createdBy: actor, submittedBy: actor, sourceRequestId: null,
      ledgerEntryId: null, ledgerBookId: null, referenceNumber: null, _createdAt: new Date(), _updatedAt: new Date(),
    }));
    expect((await services.report.execute(WS, report.reportId)).summary.total).toBe(500);
    expect((await services.widgetExecution.execute(widget)).value).toBe(500);

    expect((await getDocs(collection(db, 'workspaces', WS, 'reportDefinitions'))).size).toBe(1);
    expect((await getDocs(collection(db, 'workspaces', WS, 'records'))).size).toBe(4);
  });
});
