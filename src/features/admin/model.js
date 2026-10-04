/**
 * Administration History model (pure) — Step 17.3.
 *
 * Reads canonical Audit entries (Admin SDK produced them) and formats them
 * for human consumption. No business data duplication; bounded query only.
 */
import { AUDIT_ACTIONS } from '../../core/audit/auditActions.js';

export const ADMIN_RESOURCE_TYPES = Object.freeze(['ENTITY_TYPE', 'ENTITY', 'MODULE', 'MODULE_CATEGORY']);

export const ADMIN_HISTORY_ACTIONS = Object.freeze([
  AUDIT_ACTIONS.ENTITY_TYPE_CREATED, AUDIT_ACTIONS.ENTITY_TYPE_UPDATED,
  AUDIT_ACTIONS.ENTITY_TYPE_ARCHIVED, AUDIT_ACTIONS.ENTITY_TYPE_RESTORED,
  AUDIT_ACTIONS.ENTITY_TYPE_DELETED,
  AUDIT_ACTIONS.ENTITY_CREATED, AUDIT_ACTIONS.ENTITY_UPDATED,
  AUDIT_ACTIONS.ENTITY_ARCHIVED, AUDIT_ACTIONS.ENTITY_RESTORED,
  AUDIT_ACTIONS.ENTITY_DELETED,
  AUDIT_ACTIONS.MODULE_CREATED, AUDIT_ACTIONS.MODULE_UPDATED,
  AUDIT_ACTIONS.MODULE_ARCHIVED, AUDIT_ACTIONS.MODULE_RESTORED,
  AUDIT_ACTIONS.MODULE_DELETED,
  AUDIT_ACTIONS.MODULE_CATEGORY_CREATED, AUDIT_ACTIONS.MODULE_CATEGORY_UPDATED,
  AUDIT_ACTIONS.MODULE_CATEGORY_ARCHIVED, AUDIT_ACTIONS.MODULE_CATEGORY_RESTORED,
  AUDIT_ACTIONS.MODULE_CATEGORY_DELETED,
]);

const VERB = Object.freeze({
  [AUDIT_ACTIONS.ENTITY_TYPE_CREATED]: 'Created Entity Type', [AUDIT_ACTIONS.ENTITY_TYPE_UPDATED]: 'Updated Entity Type',
  [AUDIT_ACTIONS.ENTITY_TYPE_ARCHIVED]: 'Archived Entity Type', [AUDIT_ACTIONS.ENTITY_TYPE_RESTORED]: 'Restored Entity Type',
  [AUDIT_ACTIONS.ENTITY_TYPE_DELETED]: 'Deleted Entity Type',
  [AUDIT_ACTIONS.ENTITY_CREATED]: 'Created Entity', [AUDIT_ACTIONS.ENTITY_UPDATED]: 'Updated Entity',
  [AUDIT_ACTIONS.ENTITY_ARCHIVED]: 'Archived Entity', [AUDIT_ACTIONS.ENTITY_RESTORED]: 'Restored Entity',
  [AUDIT_ACTIONS.ENTITY_DELETED]: 'Deleted Entity',
  [AUDIT_ACTIONS.MODULE_CREATED]: 'Created Module', [AUDIT_ACTIONS.MODULE_UPDATED]: 'Updated Module',
  [AUDIT_ACTIONS.MODULE_ARCHIVED]: 'Archived Module', [AUDIT_ACTIONS.MODULE_RESTORED]: 'Restored Module',
  [AUDIT_ACTIONS.MODULE_DELETED]: 'Deleted Module',
  [AUDIT_ACTIONS.MODULE_CATEGORY_CREATED]: 'Created Category', [AUDIT_ACTIONS.MODULE_CATEGORY_UPDATED]: 'Updated Category',
  [AUDIT_ACTIONS.MODULE_CATEGORY_ARCHIVED]: 'Archived Category', [AUDIT_ACTIONS.MODULE_CATEGORY_RESTORED]: 'Restored Category',
  [AUDIT_ACTIONS.MODULE_CATEGORY_DELETED]: 'Deleted Category',
});

export function describeAdminAction(entry) {
  return VERB[entry.action] || entry.action;
}

/**
 * Renders a change set like `{ before: {...}, after: {...} }` as readable
 * lines: ['Vehclie → Vehicle', 'status: SUBMITTED → CANCELLED'].
 */
export function describeBeforeAfter(entry) {
  const change = entry?.metadata?.change;
  if (!change) return [];
  const lines = [];
  const keys = new Set([...Object.keys(change.before || {}), ...Object.keys(change.after || {})]);
  for (const key of keys) {
    const before = JSON.stringify((change.before || {})[key] ?? null);
    const after = JSON.stringify((change.after || {})[key] ?? null);
    if (before === after) continue;
    lines.push(before === 'null' ? `${key}: → ${after}` : `${key}: ${before} → ${after}`);
  }
  return lines;
}

/**
 * Filters a page of already-fetched audit entries client-side (bounded ≤ 100).
 * Server already constrains by workspace + time.
 */
export function filterAdminHistory(entries, { resourceType = null, action = null, actorId = null } = {}) {
  return (entries || []).filter((entry) => {
    if (resourceType && entry.resourceType !== resourceType) return false;
    if (action && entry.action !== action) return false;
    if (actorId && entry.actor?.actorId !== actorId) return false;
    return true;
  });
}
