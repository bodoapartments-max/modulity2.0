import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { validateAutomatBuildPlan } from './generated/src/agents/automat/buildPlanValidator.js';
import { assertPlanApprovable, summarizePlanApplication } from './generated/src/agents/automat/automatApplyContract.js';
import { fingerprintValue, normalizeForFingerprint } from './generated/src/agents/automat/planIntegrity.js';
import { assertAutomatEntitlement, authorizeAutomat } from './automatAuthorization.js';
import { configurationFingerprint, loadAdminWorkspaceSnapshot } from './automatSnapshot.js';

const planRef = (db, workspaceId, planId) => db.doc(`workspaces/${workspaceId}/automatPlans/${planId}`);
const clean = (value) => JSON.parse(normalizeForFingerprint(value));
const fail = (code, message, details = {}) => { throw new HttpsError('failed-precondition', message, { code, ...details }); };

export async function persistAutomatPlan(db, { workspaceId, userId, plan, planningFingerprint }) {
  const { authority } = await authorizeAutomat(db, workspaceId, userId);
  const entitlement = assertAutomatEntitlement();
  if (!plan || plan.workspaceId !== workspaceId || !plan.planId) throw new HttpsError('invalid-argument', 'A Workspace-scoped BuildPlan is required.');
  const snapshot = await loadAdminWorkspaceSnapshot(db, workspaceId);
  const currentFingerprint = await fingerprintValue(snapshot);
  if (planningFingerprint !== currentFingerprint) fail('STALE_PLAN', 'Workspace configuration changed after planning.');
  const validation = validateAutomatBuildPlan(plan, snapshot);
  if (validation.status === 'INVALID') fail('PLAN_INVALID', 'BuildPlan validation failed.', { issues: validation.issues });
  const normalizedPlan = clean({ ...plan, status: 'READY_FOR_REVIEW', validation });
  const planFingerprint = await fingerprintValue(normalizedPlan);
  const ref = planRef(db, workspaceId, plan.planId);
  const existing = await ref.get();
  if (existing.exists) {
    if (existing.data().planFingerprint !== planFingerprint) fail('PLAN_CHANGED', 'A different plan already uses this identity.');
    return serializePlan(existing.id, existing.data(), true);
  }
  const document = { planId: plan.planId, planVersion: plan.planVersion, workspaceId, plan: normalizedPlan, planFingerprint, configurationFingerprint: currentFingerprint, status: 'READY_FOR_REVIEW', requestedBy: userId, authority, entitlement, summary: summarizePlanApplication(validation), createdAt: FieldValue.serverTimestamp(), reviewedAt: null, approvedBy: null, approvedAt: null, operationId: null, updatedAt: FieldValue.serverTimestamp() };
  await ref.create(document);
  return { ...serializePlan(plan.planId, document, false), createdAt: null, updatedAt: null };
}

export async function approveAutomatPlan(db, { workspaceId, userId, planId, planFingerprint }) {
  const { authority } = await authorizeAutomat(db, workspaceId, userId);
  const entitlement = assertAutomatEntitlement();
  const ref = planRef(db, workspaceId, planId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Automat plan not found.');
  const data = snapshot.data();
  if (data.planFingerprint !== planFingerprint) fail('PLAN_CHANGED', 'Plan fingerprint does not match.');
  if (data.status === 'APPROVED') return serializePlan(planId, data, true);
  if (data.status !== 'READY_FOR_REVIEW') fail('PLAN_NOT_APPROVED', 'Plan is not ready for approval.');
  assertPlanApprovable(data.plan);
  const currentFingerprint = await configurationFingerprint(db, workspaceId);
  if (currentFingerprint !== data.configurationFingerprint) fail('STALE_PLAN', 'Workspace configuration changed after planning.');
  await ref.update({ status: 'APPROVED', approvedBy: userId, approvedAt: FieldValue.serverTimestamp(), reviewedAt: FieldValue.serverTimestamp(), authority, entitlement, updatedAt: FieldValue.serverTimestamp() });
  return serializePlan(planId, { ...data, status: 'APPROVED', approvedBy: userId, authority, entitlement }, false);
}

export async function getAutomatPlan(db, { workspaceId, userId, planId }) {
  await authorizeAutomat(db, workspaceId, userId);
  const snapshot = await planRef(db, workspaceId, planId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Automat plan not found.');
  return serializePlan(planId, snapshot.data(), false);
}

function serializePlan(planId, data, idempotent) {
  const timestamp = (value) => value?.toDate?.()?.toISOString?.() || value || null;
  return { planId, planVersion: data.planVersion, workspaceId: data.workspaceId, plan: data.plan, planFingerprint: data.planFingerprint, configurationFingerprint: data.configurationFingerprint, status: data.status, requestedBy: data.requestedBy, approvedBy: data.approvedBy || null, operationId: data.operationId || null, summary: data.summary, createdAt: timestamp(data.createdAt), updatedAt: timestamp(data.updatedAt), approvedAt: timestamp(data.approvedAt), idempotent };
}
