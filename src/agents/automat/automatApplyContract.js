export const AUTOMAT_APPLY_STATUSES = Object.freeze({ READY_FOR_REVIEW: 'READY_FOR_REVIEW', APPROVED: 'APPROVED', APPLYING: 'APPLYING', APPLIED: 'APPLIED', FAILED: 'FAILED', PARTIAL_FAILED: 'PARTIAL_FAILED', SUPERSEDED: 'SUPERSEDED' });
export const AUTOMAT_APPLY_PHASES = Object.freeze(['PREPARING', 'ENTITY_TYPES', 'MODULES', 'WORKSETS', 'WIDGETS', 'REPORTS', 'VERIFYING', 'COMPLETE']);
export const AUTOMAT_RESOURCE_ACTIONS = Object.freeze({ CREATED: 'CREATED', REUSED: 'REUSED', SAFE_UPDATED: 'SAFE_UPDATED', OMITTED_UNSUPPORTED: 'OMITTED_UNSUPPORTED' });
export const AUTOMAT_APPLY_ERROR_CODES = Object.freeze(['UNAUTHENTICATED', 'UNAUTHORIZED', 'ENTITLEMENT_DENIED', 'PLAN_INVALID', 'PLAN_NOT_APPROVED', 'PLAN_CHANGED', 'STALE_PLAN', 'CONFLICT', 'UNSUPPORTED', 'APPLY_IN_PROGRESS', 'RESOURCE_CREATE_FAILED', 'PARTIAL_FAILURE', 'VERIFICATION_FAILED', 'INTERNAL_ERROR']);
export const SAFE_UPDATE_POLICY = Object.freeze({ ENTITY_TYPE: false, MODULE: false, RELATIONSHIP: false, WORKSET: false, WIDGET: false, REPORT: false });

export function summarizePlanApplication(validation) {
  const counts = { CREATE: 0, REUSE: 0, SAFE_UPDATE: 0, CONFLICT: 0, UNSUPPORTED: 0 };
  for (const item of validation.classifications || []) if (counts[item.operation] !== undefined) counts[item.operation] += 1;
  return Object.freeze(counts);
}

export function assertPlanApprovable(plan) {
  if (plan.validation?.status === 'INVALID') throw Object.assign(new Error('Plan validation is invalid'), { code: 'PLAN_INVALID' });
  const requiredQuestions = (plan.unresolvedQuestions || []).filter((item) => item.category === 'REQUIRED_BEFORE_APPLY');
  if (requiredQuestions.length) throw Object.assign(new Error('Required planning questions remain unresolved'), { code: 'PLAN_INVALID' });
  const blocking = (plan.validation?.classifications || []).filter((item) => item.operation === 'CONFLICT' || item.operation === 'SAFE_UPDATE');
  if (blocking.length) throw Object.assign(new Error('Plan contains unresolved conflicts or unsupported safe updates'), { code: 'CONFLICT' });
  return true;
}
