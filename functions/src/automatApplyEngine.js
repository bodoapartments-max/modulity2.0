import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { createEntityType } from './generated/src/core/data/entityType.js';
import { createModule } from './generated/src/modules/module.js';
import { validateFormSchema } from './generated/src/modules/forms/formSchemaValidator.js';
import { createWorkset } from './generated/src/core/workspace/workset.js';
import { createWidgetDefinition } from './generated/src/core/workspace/widgetDefinition.js';
import { createReportDefinition } from './generated/src/core/analytics/reportDefinition.js';
import { createAuditEntry } from './generated/src/core/audit/auditEntry.js';
import { createModuleCategory } from './generated/src/core/workspace/moduleCategory.js';
import { generateTechnicalCode } from './generated/src/core/utils/technicalCode.js';
import { createNotification } from './generated/src/core/workspace/notification.js';
import { validateAutomatBuildPlan } from './generated/src/agents/automat/buildPlanValidator.js';
import { assertPlanApprovable } from './generated/src/agents/automat/automatApplyContract.js';
import { fingerprintValue } from './generated/src/agents/automat/planIntegrity.js';
import { assertAutomatEntitlement, authorizeAutomat } from './automatAuthorization.js';
import { configurationFingerprint, loadAdminWorkspaceSnapshot } from './automatSnapshot.js';

const internalActor = { actorType: 'INTERNAL_AGENT', actorId: 'automat-system-builder' };
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const idFor = (type, value) => `auto_${type}_${slug(value)}`;
const planRef = (db, workspaceId, planId) => db.doc(`workspaces/${workspaceId}/automatPlans/${planId}`);
const operationRef = (db, operationId) => db.doc(`automatApplyOperations/${operationId}`);
const lockRef = (db, workspaceId) => db.doc(`workspaceAutomatOperations/${workspaceId}`);
const timestamp = (value) => value?.toDate?.()?.toISOString?.() || value || null;
const leaseExpiration = () => Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);
const fail = (code, message, details = {}) => { throw new HttpsError('failed-precondition', message, { code, ...details }); };
const cleanTimestamps = (value) => { const { createdAt: _createdAt, updatedAt: _updatedAt, archivedAt: _archivedAt, ...rest } = value; return rest; };

async function findOne(db, path, field, value) {
  const snapshot = await db.collection(path).where(field, '==', value).limit(1).get();
  return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

async function createEntityTypeResource(db, workspaceId, proposal, references) {
  const existing = await findOne(db, `workspaces/${workspaceId}/entityTypes`, 'code', proposal.code);
  if (existing) return { id: existing.id, action: 'REUSED' };
  const id = idFor('et', proposal.code);
  const ref = db.doc(`workspaces/${workspaceId}/entityTypes/${id}`);
  if ((await ref.get()).exists) fail('CONFLICT', `Entity Type identity is occupied: ${proposal.code}`);
  const value = createEntityType({ typeId: id, workspaceId, code: proposal.code, name: proposal.name, category: 'DOMAIN', description: proposal.description || '', status: 'ACTIVE', schemaVersion: '1.0.0', fields: resolveFields(proposal.fields || [], references) });
  await ref.create({ ...cleanTimestamps(value), createdBy: internalActor, _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
  return { id, action: 'CREATED' };
}

function resolveFields(fields, references) {
  return fields.map((field) => field.type === 'entity-reference' ? { ...field, entityTypeId: references[field.entityTypeId] || field.entityTypeId } : { ...field });
}

/**
 * Step 17.2 — canonical Module Category resolution for Automat applies.
 * Finds an existing workspace category by generated code; otherwise creates a
 * new server-authored category. Deterministic: the same area code always
 * resolves to the same canonical category within the workspace.
 */
async function ensureModuleCategoryResource(db, workspaceId, areaName) {
  const code = generateTechnicalCode(areaName);
  const existing = await findOne(db, `workspaces/${workspaceId}/moduleCategories`, 'categoryCode', code);
  if (existing) return { id: existing.categoryId || existing.id, action: 'REUSED' };
  const categoryId = `cat_${code.toLowerCase()}`;
  const value = createModuleCategory({
    categoryId,
    workspaceId,
    displayName: areaName.trim(),
    categoryCode: code,
    description: '',
    status: 'ACTIVE',
    createdBy: internalActor,
  });
  await db.doc(`workspaces/${workspaceId}/moduleCategories/${categoryId}`).create({
    ...cleanTimestamps(value),
    _createdAt: FieldValue.serverTimestamp(),
    _updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: categoryId, action: 'CREATED' };
}

async function createModuleResource(db, workspaceId, proposal, references) {
  const existing = await findOne(db, `workspaces/${workspaceId}/modules`, 'moduleCode', proposal.moduleCode);
  if (existing) return { id: existing.id, action: 'REUSED' };
  // Step 17.2 — normalize the proposal's area into the canonical category
  // model. Automat uses the SAME moduleCategories collection as manual UI.
  const categoryId = proposal.category ? (await ensureModuleCategoryResource(db, workspaceId, proposal.category)).id : null;
  const id = idFor('mod', proposal.moduleCode);
  const formSchema = { ...proposal.formSchema, fields: resolveFields(proposal.formSchema.fields, references) };
  const formResult = validateFormSchema(formSchema);
  if (!formResult.valid) fail('RESOURCE_CREATE_FAILED', `Invalid Module Form Schema: ${proposal.moduleCode}`);
  const value = createModule({ moduleId: id, workspaceId, moduleCode: proposal.moduleCode, name: proposal.name, description: proposal.description || '', category: proposal.category || '', categoryId, status: 'ACTIVE', version: 1, formSchema, recordConfig: { recordType: proposal.recordType || proposal.moduleCode }, displayConfig: proposal.displayConfig || {}, primaryEntityTypeId: proposal.primaryEntityTypeRef ? references[proposal.primaryEntityTypeRef] || null : null, createdBy: internalActor });
  const moduleDocument = cleanTimestamps(value);
  const moduleRef = db.doc(`workspaces/${workspaceId}/modules/${id}`);
  const codeRef = db.doc(`workspaces/${workspaceId}/moduleCodes/${proposal.moduleCode}`);
  const versionRef = db.doc(`workspaces/${workspaceId}/modules/${id}/versions/1`);
  await db.runTransaction(async (transaction) => {
    const [moduleSnapshot, codeSnapshot] = await Promise.all([transaction.get(moduleRef), transaction.get(codeRef)]);
    if (moduleSnapshot.exists || codeSnapshot.exists) fail('CONFLICT', `Module identity appeared during apply: ${proposal.moduleCode}`);
    transaction.create(codeRef, { moduleCode: proposal.moduleCode, moduleId: id, workspaceId, reservedBy: internalActor, reservedAt: FieldValue.serverTimestamp() });
    transaction.create(moduleRef, { ...moduleDocument, _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
    transaction.create(versionRef, { moduleId: id, workspaceId, version: 1, moduleCode: proposal.moduleCode, name: proposal.name, formSchema, recordConfig: moduleDocument.recordConfig, displayConfig: moduleDocument.displayConfig, primaryEntityTypeId: moduleDocument.primaryEntityTypeId, createdBy: internalActor, _createdAt: FieldValue.serverTimestamp() });
  });
  return { id, action: 'CREATED' };
}

async function createWorksetResource(db, workspaceId, proposal, references) {
  const existing = await findOne(db, `workspaces/${workspaceId}/worksets`, 'name', proposal.name);
  if (existing) return { id: existing.id, action: 'REUSED' };
  const id = idFor('workset', proposal.ref);
  const value = createWorkset({ worksetId: id, workspaceId, name: proposal.name, description: proposal.description || '', moduleIds: proposal.moduleRefs.map((ref) => references[ref]), status: 'ACTIVE', metadata: { automatPlanRef: proposal.ref }, createdBy: internalActor });
  await db.doc(`workspaces/${workspaceId}/worksets/${id}`).create({ ...cleanTimestamps(value), _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
  return { id, action: 'CREATED' };
}

async function createWidgetResource(db, workspaceId, proposal, references, ownerUserId) {
  const existing = await findOne(db, `workspaces/${workspaceId}/widgetDefinitions`, 'name', proposal.name);
  if (existing) return { id: existing.id, action: 'REUSED' };
  const id = idFor('widget', proposal.ref);
  const definition = proposal.definition;
  const value = createWidgetDefinition({ widgetId: id, workspaceId, ownerUserId, name: proposal.name, type: definition.type, source: definition.source, moduleIds: proposal.moduleRefs.map((ref) => references[ref]), filters: definition.filters || [], metric: definition.metric || 'COUNT', display: definition.display || { limit: 10 }, status: 'ACTIVE', createdBy: internalActor });
  await db.doc(`workspaces/${workspaceId}/widgetDefinitions/${id}`).create({ ...cleanTimestamps(value), _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
  return { id, action: 'CREATED' };
}

async function createReportResource(db, workspaceId, proposal, references) {
  const existing = await findOne(db, `workspaces/${workspaceId}/reportDefinitions`, 'name', proposal.name);
  if (existing) return { id: existing.id, action: 'REUSED' };
  const id = idFor('report', proposal.ref);
  const definition = proposal.definition;
  const dataSources = definition.dataSources.map((source) => ({ sourceType: source.sourceType, ...(source.moduleRef ? { moduleId: references[source.moduleRef] } : {}) }));
  const value = createReportDefinition({ reportId: id, workspaceId, name: proposal.name, status: 'ACTIVE', version: 1, dataSources, filters: definition.filters || [], groupBy: definition.groupBy || [], metrics: definition.metrics || [], columns: definition.columns || [], sort: definition.sort || [], visualization: definition.visualization || { type: 'TABLE' }, createdBy: internalActor });
  await db.doc(`workspaces/${workspaceId}/reportDefinitions/${id}`).create({ ...cleanTimestamps(value), _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp(), _archivedAt: null });
  return { id, action: 'CREATED' };
}

const phases = [
  ['ENTITY_TYPES', 'proposedEntityTypes', 'ENTITY_TYPE', createEntityTypeResource],
  ['MODULES', 'proposedModules', 'MODULE', createModuleResource],
  ['WORKSETS', 'proposedWorksets', 'WORKSET', createWorksetResource],
  ['WIDGETS', 'proposedWidgets', 'WIDGET', createWidgetResource],
  ['REPORTS', 'proposedReports', 'REPORT', createReportResource],
];

export async function applyAutomatPlan(db, { workspaceId, userId, planId, operationId }, options = {}) {
  const { authority } = await authorizeAutomat(db, workspaceId, userId);
  const entitlement = assertAutomatEntitlement();
  if (!operationId || operationId.length > 128) throw new HttpsError('invalid-argument', 'A valid operationId is required.');
  const pRef = planRef(db, workspaceId, planId);
  const pSnapshot = await pRef.get();
  if (!pSnapshot.exists) throw new HttpsError('not-found', 'Automat plan not found.');
  const planData = pSnapshot.data();
  if (!['APPROVED', 'FAILED', 'APPLYING', 'APPLIED'].includes(planData.status)) fail('PLAN_NOT_APPROVED', 'Plan has not been approved.');
  if (await fingerprintValue(planData.plan) !== planData.planFingerprint) fail('PLAN_CHANGED', 'Persisted plan integrity verification failed.');
  assertPlanApprovable(planData.plan);
  const oRef = operationRef(db, operationId);
  const existingOperation = await oRef.get();
  if (existingOperation.exists && existingOperation.data().status === 'APPLIED') return serializeOperation(operationId, existingOperation.data(), true);
  const expiredApply = existingOperation.exists && existingOperation.data().status === 'APPLYING' && existingOperation.data().leaseExpiresAt?.toMillis?.() <= Date.now();
  const resume = existingOperation.exists && (['FAILED', 'PARTIAL_FAILED'].includes(existingOperation.data().status) || expiredApply);
  if (existingOperation.exists && existingOperation.data().status === 'APPLYING' && !expiredApply) return serializeOperation(operationId, existingOperation.data(), true);
  const currentFingerprint = await configurationFingerprint(db, workspaceId);
  const expectedFingerprint = resume ? existingOperation.data().lastKnownFingerprint : planData.configurationFingerprint;
  if (currentFingerprint !== expectedFingerprint) fail('STALE_PLAN', 'Workspace configuration changed after plan approval.');
  const currentSnapshot = await loadAdminWorkspaceSnapshot(db, workspaceId);
  const validation = validateAutomatBuildPlan(planData.plan, currentSnapshot);
  if (validation.status === 'INVALID' || validation.classifications.some((item) => item.operation === 'CONFLICT' || item.operation === 'SAFE_UPDATE')) fail('CONFLICT', 'Current Workspace conflicts with the approved plan.', { issues: validation.issues });
  const resetOperation = await db.doc(`workspaceResetOperations/${workspaceId}`).get();
  if (resetOperation.exists && resetOperation.data().status === 'RUNNING') fail('APPLY_IN_PROGRESS', 'Workspace reset is currently running.');
  const acquisition = await db.runTransaction(async (transaction) => {
    const [lock, operation] = await Promise.all([transaction.get(lockRef(db, workspaceId)), transaction.get(oRef)]);
    if (lock.exists && lock.data().status === 'APPLYING' && lock.data().operationId !== operationId && lock.data().leaseExpiresAt?.toMillis?.() > Date.now()) fail('APPLY_IN_PROGRESS', 'Another Automat plan is applying to this Workspace.');
    if (operation.exists && operation.data().planId !== planId) fail('PLAN_CHANGED', 'operationId belongs to another plan.');
    if (operation.exists && operation.data().status === 'APPLYING' && operation.data().leaseExpiresAt?.toMillis?.() > Date.now()) return { acquired: false, operation: operation.data() };
    const leaseExpiresAt = leaseExpiration();
    transaction.set(lockRef(db, workspaceId), { workspaceId, operationId, planId, status: 'APPLYING', requestedBy: userId, leaseExpiresAt, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(oRef, { operationId, workspaceId, planId, planVersion: planData.planVersion, requestedBy: userId, approvedBy: planData.approvedBy, authority, entitlement, status: 'APPLYING', phase: 'PREPARING', inputFingerprint: planData.planFingerprint, currentFingerprint, lastKnownFingerprint: currentFingerprint, resourceResults: operation.exists ? operation.data().resourceResults || [] : [], referenceMap: operation.exists ? operation.data().referenceMap || {} : {}, warnings: planData.plan.warnings || [], errors: [], provenance: planData.plan.provenance, leaseExpiresAt, startedAt: operation.exists ? operation.data().startedAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.update(pRef, { status: 'APPLYING', operationId, updatedAt: FieldValue.serverTimestamp() });
    return { acquired: true };
  });
  if (!acquisition.acquired) return serializeOperation(operationId, acquisition.operation, true);
  const operationData = (await oRef.get()).data();
  const results = new Map((operationData.resourceResults || []).map((item) => [item.planRef, item]));
  const references = { ...(operationData.referenceMap || {}) };
  try {
    for (const [phase, planKey, resourceType, handler] of phases) {
      await oRef.update({ phase, leaseExpiresAt: leaseExpiration(), updatedAt: FieldValue.serverTimestamp() });
      for (const proposal of planData.plan[planKey] || []) {
        if (results.get(proposal.ref)?.status === 'SUCCESS') continue;
        const created = await handler(db, workspaceId, proposal, references, planData.approvedBy);
        references[proposal.ref] = created.id;
        results.set(proposal.ref, { planRef: proposal.ref, resourceType, classification: validation.classifications.find((item) => item.ref === proposal.ref)?.operation || 'CREATE', action: created.action, canonicalResourceId: created.id, status: 'SUCCESS', errorCode: null, message: null });
        await oRef.update({ resourceResults: [...results.values()], referenceMap: references, updatedAt: FieldValue.serverTimestamp() });
      }
      if (options.failAfterPhase === phase) throw Object.assign(new Error(`Injected failure after ${phase}`), { code: 'INJECTED_FAILURE' });
      const lastKnownFingerprint = await configurationFingerprint(db, workspaceId);
      await oRef.update({ lastKnownFingerprint, updatedAt: FieldValue.serverTimestamp() });
    }
    for (const relationship of planData.plan.proposedRelationships || []) results.set(relationship.ref, { planRef: relationship.ref, resourceType: 'RELATIONSHIP', classification: 'UNSUPPORTED', action: 'OMITTED_UNSUPPORTED', canonicalResourceId: null, status: 'SUCCESS', errorCode: null, message: 'Type-level relationship recommendation remains review-only.' });
    await oRef.update({ phase: 'VERIFYING', resourceResults: [...results.values()], referenceMap: references, updatedAt: FieldValue.serverTimestamp() });
    await verifyAppliedResources(db, workspaceId, references);
    const finalFingerprint = await configurationFingerprint(db, workspaceId);
    const completed = { status: 'APPLIED', phase: 'COMPLETE', resourceResults: [...results.values()], referenceMap: references, finalFingerprint, lastKnownFingerprint: finalFingerprint, leaseExpiresAt: null, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    await Promise.all([oRef.update(completed), pRef.update({ status: 'APPLIED', operationId, appliedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }), lockRef(db, workspaceId).set({ workspaceId, operationId, planId, status: 'APPLIED', updatedAt: FieldValue.serverTimestamp() }), writeApplyAudit(db, { workspaceId, userId, planId, operationId, results: [...results.values()], provenance: planData.plan.provenance }), writeCompletionNotification(db, { workspaceId, userId, planId, operationId })]);
    return serializeOperation(operationId, { ...operationData, ...completed, completedAt: null, updatedAt: null }, false);
  } catch (error) {
    const lastKnownFingerprint = await configurationFingerprint(db, workspaceId);
    const status = results.size ? 'PARTIAL_FAILED' : 'FAILED';
    const failure = { status, phase: (await oRef.get()).data().phase, resourceResults: [...results.values()], referenceMap: references, errors: [{ code: error.code || 'RESOURCE_CREATE_FAILED', message: error.message }], lastKnownFingerprint, leaseExpiresAt: null, updatedAt: FieldValue.serverTimestamp() };
    await Promise.all([oRef.update(failure), pRef.update({ status: 'FAILED', operationId, updatedAt: FieldValue.serverTimestamp() }), lockRef(db, workspaceId).set({ workspaceId, operationId, planId, status, updatedAt: FieldValue.serverTimestamp() })]);
    throw new HttpsError('internal', 'Automat application did not complete.', { code: status === 'PARTIAL_FAILED' ? 'PARTIAL_FAILURE' : 'RESOURCE_CREATE_FAILED', operationId });
  }
}

async function verifyAppliedResources(db, workspaceId, references) {
  const checks = await Promise.all(Object.entries(references).map(([ref, id]) => {
    const collection = ref.startsWith('entityType:') ? 'entityTypes' : ref.startsWith('module:') ? 'modules' : ref.startsWith('workset:') ? 'worksets' : ref.startsWith('widget:') ? 'widgetDefinitions' : ref.startsWith('report:') ? 'reportDefinitions' : null;
    return collection ? db.doc(`workspaces/${workspaceId}/${collection}/${id}`).get() : null;
  }));
  if (checks.some((snapshot) => snapshot && !snapshot.exists)) fail('VERIFICATION_FAILED', 'An applied canonical resource could not be verified.');
}

async function writeApplyAudit(db, { workspaceId, userId, planId, operationId, results, provenance }) {
  const id = `automat_${operationId}`;
  const entry = createAuditEntry({ auditEntryId: id, workspaceId, actor: { actorType: 'USER', actorId: userId }, action: 'automat.plan.applied', resourceType: 'AUTOMAT_PLAN', resourceId: planId, metadata: { operationId, created: results.filter((item) => item.action === 'CREATED').length, reused: results.filter((item) => item.action === 'REUSED').length, agentExecutions: provenance.generatedBy.map((item) => item.requestId) }, correlationId: operationId, source: 'system' });
  const { timestamp: _timestamp, ...data } = entry;
  await db.doc(`workspaces/${workspaceId}/auditEntries/${id}`).set({ ...data, _timestamp: FieldValue.serverTimestamp() });
  await db.doc(`automatApplyAudits/${operationId}`).set({ workspaceId, planId, operationId, requestedBy: userId, result: 'APPLIED', createdCount: entry.metadata.created, reusedCount: entry.metadata.reused, executedAt: FieldValue.serverTimestamp() });
}

async function writeCompletionNotification(db, { workspaceId, userId, planId, operationId }) {
  const id = `automat_${operationId}`;
  const value = createNotification({ notificationId: id, workspaceId, recipientUserId: userId, type: 'AUTOMAT_PLAN_APPLIED', title: 'System plan applied', message: 'Your Workspace configuration is ready.', resourceType: 'AUTOMAT_PLAN', resourceId: planId, actionUrl: '/app/automat', metadata: { operationId }, createdBy: internalActor });
  const { createdAt: _createdAt, readAt: _readAt, ...data } = value;
  await db.doc(`workspaces/${workspaceId}/notifications/${id}`).set({ ...data, _createdAt: FieldValue.serverTimestamp(), _readAt: null });
}

export async function getAutomatApplyOperation(db, { workspaceId, userId, operationId }) {
  await authorizeAutomat(db, workspaceId, userId);
  const snapshot = await operationRef(db, operationId).get();
  if (!snapshot.exists || snapshot.data().workspaceId !== workspaceId) throw new HttpsError('not-found', 'Automat apply operation not found.');
  return serializeOperation(operationId, snapshot.data(), false);
}

function serializeOperation(operationId, data, idempotent) {
  return { operationId, workspaceId: data.workspaceId, planId: data.planId, planVersion: data.planVersion, status: data.status, phase: data.phase, resourceResults: data.resourceResults || [], referenceMap: data.referenceMap || {}, warnings: data.warnings || [], errors: data.errors || [], inputFingerprint: data.inputFingerprint, currentFingerprint: data.currentFingerprint, finalFingerprint: data.finalFingerprint || null, requestedBy: data.requestedBy, approvedBy: data.approvedBy, startedAt: timestamp(data.startedAt), completedAt: timestamp(data.completedAt), updatedAt: timestamp(data.updatedAt), idempotent };
}
