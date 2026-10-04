/**
 * Trusted Administration Command Engine (server-side, Admin SDK).
 *
 * Entity Types, Entities, Modules and Module Categories are protected
 * business configuration. Their mutations are authored HERE — browsers are
 * readers and intent-collectors only.
 *
 * Boundary:
 *   authentication → workspace authorization (ADMINISTER capability) →
 *   validation → dependency analysis (destructive) → single-transaction
 *   mutation + before/after Audit + operation journal idempotency
 *
 * All four resources converge on ONE engine. Future trusted consumers
 * (Automat, Agents, external API) use the same command contract.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  validateAdminCommand,
  ADMIN_COMMAND_TYPES,
  ADMIN_COMMAND_ERROR_CODES,
} from './generated/src/core/admin/adminCommandContract.js';
import {
  ADMIN_DEPENDENCIES_BY_RESOURCE,
  ADMIN_DEPENDENCY_KINDS,
  explainDependencies,
} from './generated/src/core/admin/adminDependencyAnalyzer.js';
import { createEntityType, ENTITY_TYPE_CATEGORIES } from './generated/src/core/data/entityType.js';
import { createEntity, ENTITY_STATUSES } from './generated/src/core/data/entity.js';
import { createModule } from './generated/src/modules/module.js';
import { validateFormSchema } from './generated/src/modules/forms/formSchemaValidator.js';
import { createModuleCategory, MODULE_CATEGORY_STATUSES } from './generated/src/core/workspace/moduleCategory.js';
import { generateTechnicalCode, resolveCodeCollision } from './generated/src/core/utils/technicalCode.js';
import { generateId } from './generated/src/core/utils/generateId.js';
import { createAuditEntry } from './generated/src/core/audit/auditEntry.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES, AUDIT_SOURCES } from './generated/src/core/audit/auditActions.js';
import {
  OPERATION_STATUS,
  OPERATION_LEASE_MS,
  MAX_RECOVERY_ATTEMPTS,
  computeOperationFingerprint,
  operationDoc,
  buildOperationDocument,
  peekCompletedOperation,
} from './operationJournal.js';

const CODES = ADMIN_COMMAND_ERROR_CODES;

const fail = (code, message, details = {}) => {
  const httpCode =
    code === CODES.UNAUTHENTICATED ? 'unauthenticated'
    : code === CODES.WORKSPACE_NOT_FOUND || code === CODES.RESOURCE_NOT_FOUND ? 'not-found'
    : code === CODES.WORKSPACE_FORBIDDEN || code === CODES.ADMIN_FORBIDDEN ? 'permission-denied'
    : code === CODES.DEPENDENCY_BLOCKED ? 'failed-precondition'
    : 'failed-precondition';
  throw new HttpsError(httpCode, message, { code, ...details });
};

// ─── Authorization: USE != ADMINISTER ───────────────────────────────────────

/**
 * Minimal per-command authority. USER = any active member can perform
 * day-to-day business operations (create/edit own Entities). ADMIN = only
 * workspace OWNER/ADMIN may change configuration/delete/lifecycle.
 */
const COMMAND_AUTHORITY = Object.freeze({
  [ADMIN_COMMAND_TYPES.CREATE_ENTITY]: 'USER',
  [ADMIN_COMMAND_TYPES.UPDATE_ENTITY]: 'USER',
  [ADMIN_COMMAND_TYPES.ARCHIVE_ENTITY]: 'ADMIN',
  [ADMIN_COMMAND_TYPES.RESTORE_ENTITY]: 'ADMIN',
  [ADMIN_COMMAND_TYPES.DELETE_ENTITY]: 'ADMIN',
});

async function authorizeAdmin(db, workspaceId, userId, level = 'ADMIN') {
  const wsSnap = await db.doc(`workspaces/${workspaceId}`).get();
  if (!wsSnap.exists) fail(CODES.WORKSPACE_NOT_FOUND, 'Workspace not found.');
  const workspace = wsSnap.data();
  if (workspace.type === 'PERSONAL') {
    if (workspace.ownerUserId !== userId) fail(CODES.WORKSPACE_FORBIDDEN, 'Only the Personal Workspace owner may perform this operation.');
    return { workspace, authority: 'PERSONAL_OWNER' };
  }
  if (workspace.type === 'ORGANIZATION') {
    const member = await db.doc(`organizations/${workspace.organizationId}/members/${userId}`).get();
    if (!member.exists || member.data().status !== 'ACTIVE') {
      fail(CODES.WORKSPACE_FORBIDDEN, 'Active workspace membership is required.');
    }
    if (level === 'ADMIN') {
      const roles = member.data().roles || [];
      if (!roles.includes('OWNER') && !roles.includes('ADMIN')) {
        fail(CODES.ADMIN_FORBIDDEN, 'Administering configuration requires an OWNER or ADMIN role.');
      }
      return { workspace, authority: 'ORGANIZATION_ADMIN', member: member.data() };
    }
    return { workspace, authority: 'ORGANIZATION_MEMBER', member: member.data() };
  }
  fail(CODES.WORKSPACE_FORBIDDEN, 'Unsupported workspace type.');
}

// ─── Typed dependency analyzer (bounded counts) ────────────────────────────

async function countQuery(db, workspaceId, collection, filters = []) {
  let q = db.collection(`workspaces/${workspaceId}/${collection}`);
  for (const [field, op, value] of filters) q = q.where(field, op, value);
  const snap = await q.limit(1).get(); // existence is enough — safety > perfect count
  return snap.empty ? 0 : 1;
}

export async function analyzeAdminDependencies(db, workspaceId, resourceType, resourceId) {
  const kinds = ADMIN_DEPENDENCIES_BY_RESOURCE[resourceType];
  if (!kinds) return {};
  const counts = {};
  for (const kind of kinds) {
    switch (kind) {
      case ADMIN_DEPENDENCY_KINDS.ENTITY_TYPE_HAS_ENTITIES: {
        counts[kind] = await countQuery(db, workspaceId, 'entities', [['entityTypeId', '==', resourceId]]);
        break;
      }
      case ADMIN_DEPENDENCY_KINDS.ENTITY_TYPE_USED_BY_MODULE_SCHEMA: {
        // Modules carry entityTypeId inside formSchema fields; we count
        // modules whose primaryEntityTypeId links OR whose form fields link.
        // Bounded: primary link scan first; schema-level link check happens
        // against a bounded module list.
        const mods = await db.collection(`workspaces/${workspaceId}/modules`)
          .limit(200).get();
        let hits = 0;
        for (const d of mods.docs) {
          const schema = d.data().formSchema;
          for (const f of schema?.fields || []) {
            if (f.type === 'entity-reference' && (f.entityTypeId === resourceId)) { hits += 1; break; }
          }
          if (hits) break;
        }
        counts[kind] = hits;
        break;
      }
      case ADMIN_DEPENDENCY_KINDS.ENTITY_TYPE_PRIMARY_OF_MODULE: {
        counts[kind] = await countQuery(db, workspaceId, 'modules', [['primaryEntityTypeId', '==', resourceId]]);
        break;
      }
      case ADMIN_DEPENDENCY_KINDS.ENTITY_REFERENCED_BY_RECORDS: {
        counts[kind] = await countQuery(db, workspaceId, 'records', [['entityReferenceIds', 'array-contains', resourceId]]);
        break;
      }
      case ADMIN_DEPENDENCY_KINDS.ENTITY_IN_RELATIONSHIPS: {
        const a = await countQuery(db, workspaceId, 'relationships', [['fromEntityId', '==', resourceId]]);
        const b = a || await countQuery(db, workspaceId, 'relationships', [['toEntityId', '==', resourceId]]);
        counts[kind] = b;
        break;
      }
      case ADMIN_DEPENDENCY_KINDS.MODULE_HAS_RECORDS: {
        counts[kind] = await countQuery(db, workspaceId, 'records', [['moduleId', '==', resourceId]]);
        break;
      }
      case ADMIN_DEPENDENCY_KINDS.MODULE_HAS_VERSIONS: {
        counts[kind] = await countQuery(db, workspaceId, `modules/${resourceId}/versions`);
        break;
      }
      case ADMIN_DEPENDENCY_KINDS.MODULE_USED_BY_LEDGER_BOOK: {
        counts[kind] = await countQuery(db, workspaceId, 'ledgerBooks', [['moduleId', '==', resourceId]]);
        break;
      }
      case ADMIN_DEPENDENCY_KINDS.MODULE_IN_WORKSET: {
        counts[kind] = await countQuery(db, workspaceId, 'worksets', [['moduleIds', 'array-contains', resourceId]]);
        break;
      }
      case ADMIN_DEPENDENCY_KINDS.MODULE_IN_WIDGET: {
        counts[kind] = await countQuery(db, workspaceId, 'widgetDefinitions', [['moduleIds', 'array-contains', resourceId]]);
        break;
      }
      case ADMIN_DEPENDENCY_KINDS.MODULE_IN_REPORT: {
        const reps = await db.collection(`workspaces/${workspaceId}/reportDefinitions`).limit(200).get();
        let hits = 0;
        for (const d of reps.docs) {
          const ds = d.data().dataSources || [];
          if (ds.some((s) => s.moduleId === resourceId)) { hits += 1; break; }
        }
        counts[kind] = hits;
        break;
      }
      case ADMIN_DEPENDENCY_KINDS.CATEGORY_USED_BY_MODULES: {
        counts[kind] = await countQuery(db, workspaceId, 'modules', [['categoryId', '==', resourceId]]);
        break;
      }
      default:
        counts[kind] = 0;
    }
  }
  return counts;
}

// ─── Bounded before/after change payloads ───────────────────────────────────

const ADMIN_AUDIT_FIELDS = Object.freeze(['name', 'displayName', 'description', 'categoryId', 'status', 'icon', 'fields', 'formSchema', 'moduleCode', 'category', 'entityTypeId', 'displayName']);

function pickBeforeAfter(previous, nextChanges) {
  const before = {};
  const after = {};
  for (const key of Object.keys(nextChanges)) {
    if (!ADMIN_AUDIT_FIELDS.includes(key)) continue;
    const prev = previous?.[key] ?? null;
    const nextVal = nextChanges[key];
    if (JSON.stringify(prev ?? null) === JSON.stringify(nextVal ?? null)) continue;
    before[key] = prev;
    after[key] = nextVal;
  }
  return Object.keys(before).length || Object.keys(after).length ? { before, after } : { before: {}, after: {} };
}

function writeAdminAuditInTransaction(transaction, db, workspaceId, { operationId, action, resourceType, resourceId, userId, change, timestamp }) {
  const docId = `op_${operationId}_${action}`;
  const entry = createAuditEntry({
    auditEntryId: docId,
    workspaceId,
    actor: { actorType: 'USER', actorId: userId },
    action,
    resourceType,
    resourceId,
    timestamp,
    metadata: { operationId, change },
    source: AUDIT_SOURCES.WEB,
    correlationId: `op:${operationId}`,
  });
  transaction.set(db.doc(`workspaces/${workspaceId}/auditEntries/${docId}`), {
    ...entry,
    _timestamp: FieldValue.serverTimestamp(),
  });
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export async function executeAdminCommand(db, { userId, command, internal = false }) {
  if (!userId) fail(CODES.UNAUTHENTICATED, 'Authentication required.');
  const envelope = validateAdminCommand(command);
  if (!envelope.valid) fail(envelope.code || CODES.COMMAND_INVALID, envelope.errors.join('; '));

  const { workspaceId } = command.payload;
  if (!internal) await authorizeAdmin(db, workspaceId, userId, COMMAND_AUTHORITY[command.commandType] || 'ADMIN');

  const fingerprint = computeOperationFingerprint(userId, command);
  const opRef = operationDoc(db, workspaceId, command.operationId);

  const peek = await peekCompletedOperation(db, {
    workspaceId, operationId: command.operationId, userId, fingerprint, fail, codes: CODES,
  });
  if (peek) return { idempotent: true, operationId: command.operationId, result: peek };

  // Destructive commands validate dependencies BEFORE the transaction — the
  // analyzer uses bounded collection queries and cannot live inside the
  // mutation transaction where Firestore forbids post-write reads.
  const isDelete = command.commandType.startsWith('DELETE_');
  let dependencyReport = null;
  if (isDelete) {
    const resourceType = command.commandType.slice('DELETE_'.length);
    dependencyReport = await analyzeAdminDependencies(db, workspaceId, resourceType, command.payload.resourceId);
    const blocked = explainDependencies(dependencyReport);
    if (blocked.length) {
      fail(CODES.DEPENDENCY_BLOCKED, `Cannot delete: dependencies exist.`, { dependencies: blocked });
    }
  }

  const now = new Date().toISOString();
  const actor = { actorType: 'USER', actorId: userId };

  const result = await db.runTransaction(async (transaction) => {
    // ALL reads before ALL writes.
    const opSnap = await transaction.get(opRef);
    // Preload the target resource for targeted commands so handlers never
    // need to read after the journal write below.
    let preloaded = null;
    const preload = preloadTargetFor(command);
    if (preload) {
      const ref = db.doc(preload);
      const snap = await transaction.get(ref);
      preloaded = { ref, snap, data: snap.exists ? snap.data() : null };
    }
    if (opSnap.exists) {
      const op = opSnap.data();
      if (op.userId !== userId || op.workspaceId !== workspaceId) fail(CODES.OPERATION_CONFLICT, 'Operation identity mismatch.');
      if (op.fingerprint !== fingerprint) fail(CODES.OPERATION_MISMATCH, 'Operation command mismatch.');
      if (op.status === OPERATION_STATUS.COMPLETED) return { replay: true, stored: op.result || null };
      if (op.status === OPERATION_STATUS.FAILED) fail(CODES.OPERATION_CONFLICT, 'Operation exists with terminal or failed status.');
      const leaseExpired = !op.leaseExpiresAt || op.leaseExpiresAt.toMillis() <= Timestamp.now().toMillis();
      if (!leaseExpired) return { inProgress: true };
      const attemptCount = (op.attemptCount || 1) + 1;
      if (attemptCount > MAX_RECOVERY_ATTEMPTS) fail(CODES.OPERATION_FAILED, 'Operation recovery limit exceeded.');
      transaction.update(opRef, { status: OPERATION_STATUS.PROCESSING, attemptCount, leaseExpiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + OPERATION_LEASE_MS), updatedAt: FieldValue.serverTimestamp() });
    } else {
      transaction.set(opRef, buildOperationDocument({ command, userId, fingerprint, status: OPERATION_STATUS.PROCESSING }));
    }

    const outcome = await executeAdminMutation(transaction, db, {
      userId, command, now, actor, workspaceId, preloaded, dependencyReport,
    });

    transaction.update(opRef, {
      status: OPERATION_STATUS.COMPLETED,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      result: outcome.result ?? null,
    });
    return outcome;
  });

  if (result.inProgress) fail(CODES.OPERATION_IN_PROGRESS, 'The same operation is already being processed.');
  if (result.replay) return { idempotent: true, operationId: command.operationId, result: result.stored };
  return { idempotent: false, operationId: command.operationId, ...result };
}

// ─── Resource mutation handlers ────────────────────────────────────────────

/** Maps targeted commands to their collection path fragment for preloading. */
function preloadTargetFor(command) {
  const { commandType, payload } = command;
  if (commandType === ADMIN_COMMAND_TYPES.CREATE_ENTITY && payload.entityTypeId) {
    return `workspaces/${payload.workspaceId}/entityTypes/${payload.entityTypeId}`;
  }
  if (!payload.resourceId) return null; // CREATE_* commands
  const collection =
    /ENTITY_TYPE/.test(commandType) ? 'entityTypes'
    : /MODULE_CATEGORY/.test(commandType) ? 'moduleCategories'
    : /MODULE/.test(commandType) ? 'modules'
    : /ENTITY/.test(commandType) ? 'entities'
    : null;
  return collection ? `workspaces/${payload.workspaceId}/${collection}/${payload.resourceId}` : null;
}

const RESOURCE_NOT_FOUND_BY_TYPE = Object.freeze({
  ENTITY_TYPE: 'Entity Type not found.',
  ENTITY: 'Entity not found.',
  MODULE: 'Module not found.',
  MODULE_CATEGORY: 'Module Category not found.',
});

function requireLoaded(ctx, resourceType) {
  const loaded = ctx.preloaded;
  if (!loaded || !loaded.snap.exists) fail(CODES.RESOURCE_NOT_FOUND, RESOURCE_NOT_FOUND_BY_TYPE[resourceType]);
  return loaded;
}

async function executeAdminMutation(transaction, db, ctx) {
  const { command } = ctx;
  const t = command.commandType;
  switch (t) {
    case ADMIN_COMMAND_TYPES.CREATE_ENTITY_TYPE: return createEntityTypeCommand(transaction, db, ctx);
    case ADMIN_COMMAND_TYPES.UPDATE_ENTITY_TYPE: return updateEntityTypeCommand(transaction, db, ctx);
    case ADMIN_COMMAND_TYPES.ARCHIVE_ENTITY_TYPE: return lifecycleEntityTypeCommand(transaction, db, ctx, 'archive');
    case ADMIN_COMMAND_TYPES.RESTORE_ENTITY_TYPE: return lifecycleEntityTypeCommand(transaction, db, ctx, 'restore');
    case ADMIN_COMMAND_TYPES.DELETE_ENTITY_TYPE: return deleteEntityTypeCommand(transaction, db, ctx);
    case ADMIN_COMMAND_TYPES.CREATE_ENTITY: return createEntityCommand(transaction, db, ctx);
    case ADMIN_COMMAND_TYPES.UPDATE_ENTITY: return updateEntityCommand(transaction, db, ctx);
    case ADMIN_COMMAND_TYPES.ARCHIVE_ENTITY: return lifecycleEntityCommand(transaction, db, ctx, 'archive');
    case ADMIN_COMMAND_TYPES.RESTORE_ENTITY: return lifecycleEntityCommand(transaction, db, ctx, 'restore');
    case ADMIN_COMMAND_TYPES.DELETE_ENTITY: return deleteEntityCommand(transaction, db, ctx);
    case ADMIN_COMMAND_TYPES.CREATE_MODULE: return createModuleCommand(transaction, db, ctx);
    case ADMIN_COMMAND_TYPES.UPDATE_MODULE_METADATA: return updateModuleCommand(transaction, db, ctx);
    case ADMIN_COMMAND_TYPES.ARCHIVE_MODULE: return lifecycleModuleCommand(transaction, db, ctx, 'archive');
    case ADMIN_COMMAND_TYPES.RESTORE_MODULE: return lifecycleModuleCommand(transaction, db, ctx, 'restore');
    case ADMIN_COMMAND_TYPES.DELETE_MODULE: return deleteModuleCommand(transaction, db, ctx);
    case ADMIN_COMMAND_TYPES.CREATE_MODULE_CATEGORY: return createModuleCategoryCommand(transaction, db, ctx);
    case ADMIN_COMMAND_TYPES.UPDATE_MODULE_CATEGORY: return updateModuleCategoryCommand(transaction, db, ctx);
    case ADMIN_COMMAND_TYPES.ARCHIVE_MODULE_CATEGORY: return lifecycleCategoryCommand(transaction, db, ctx, 'archive');
    case ADMIN_COMMAND_TYPES.RESTORE_MODULE_CATEGORY: return lifecycleCategoryCommand(transaction, db, ctx, 'restore');
    case ADMIN_COMMAND_TYPES.DELETE_MODULE_CATEGORY: return deleteModuleCategoryCommand(transaction, db, ctx);
    default:
      fail(CODES.UNSUPPORTED_COMMAND, `Command ${t} is not implemented.`);
  }
}

// ─── ENTITY TYPE ────────────────────────────────────────────────────────────

async function createEntityTypeCommand(transaction, db, { userId, command, now, actor, workspaceId }) {
  const p = command.payload;
  if (!p.name?.trim()) fail(CODES.COMMAND_INVALID, 'Entity Type name is required.');
  const existing = p.code
    ? await db.collection(`workspaces/${workspaceId}/entityTypes`).where('code', '==', p.code).limit(1).get()
      .then((s) => (s.empty ? null : s.docs[0].data()))
    : null;
  if (existing) fail(CODES.COMMAND_INVALID, `Entity Type code "${p.code}" is already in use.`);
  const codes = p.code ? [] : await listEntityTypeCodes(db, workspaceId);
  const code = p.code || resolveCodeCollision(generateTechnicalCode(p.name), codes);
  const typeId = `et_${generateId()}`;
  const value = createEntityType({
    typeId,
    workspaceId,
    code,
    name: p.name.trim(),
    category: ENTITY_TYPE_CATEGORIES.DOMAIN,
    description: p.description || '',
    icon: p.icon || '',
    status: 'ACTIVE',
    schemaVersion: '1.0.0',
    fields: p.fields || [],
  });
  // Minimum audit before/after for creation
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.ENTITY_TYPE_CREATED,
    resourceType: AUDIT_RESOURCE_TYPES.ENTITY_TYPE,
    resourceId: typeId,
    userId,
    timestamp: now,
    change: pickBeforeAfter(null, value),
  });
  transaction.set(db.doc(`workspaces/${workspaceId}/entityTypes/${typeId}`), {
    ...value,
    workspaceId,
    createdBy: actor,
    _createdAt: FieldValue.serverTimestamp(),
    _updatedAt: FieldValue.serverTimestamp(),
  });
  return { result: { typeId, code }, resourceId: typeId };
}

async function listEntityTypeCodes(db, workspaceId) {
  const snap = await db.collection(`workspaces/${workspaceId}/entityTypes`).limit(500).get();
  return snap.docs.map((d) => d.data().code).filter(Boolean);
}

async function updateEntityTypeCommand(transaction, db, ctx) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'ENTITY_TYPE');
  if (existing.category === ENTITY_TYPE_CATEGORIES.CORE) fail(CODES.ADMIN_FORBIDDEN, 'Core Entity Types cannot be modified.');
  const changes = {};
  for (const key of ['name', 'description', 'icon', 'fields']) {
    if (p[key] !== undefined) changes[key] = p[key];
  }
  if (!Object.keys(changes).length) fail(CODES.COMMAND_INVALID, 'Nothing to update.');
  const change = pickBeforeAfter(existing, changes);
  transaction.update(ref, { ...changes, _updatedAt: FieldValue.serverTimestamp() });
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.ENTITY_TYPE_UPDATED,
    resourceType: AUDIT_RESOURCE_TYPES.ENTITY_TYPE,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change,
  });
  return { result: { typeId: p.resourceId, code: existing.code } };
}

async function lifecycleEntityTypeCommand(transaction, db, ctx, direction) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'ENTITY_TYPE');
  if (existing.category === ENTITY_TYPE_CATEGORIES.CORE) fail(CODES.ADMIN_FORBIDDEN, 'Core Entity Types cannot be modified.');
  const status = direction === 'archive' ? 'ARCHIVED' : 'ACTIVE';
  if (existing.status === status) return { result: { typeId: p.resourceId }, idempotentNoop: true };
  const change = pickBeforeAfter(existing, { status });
  transaction.update(ref, { status, _updatedAt: FieldValue.serverTimestamp() });
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: direction === 'archive' ? AUDIT_ACTIONS.ENTITY_TYPE_ARCHIVED : AUDIT_ACTIONS.ENTITY_TYPE_RESTORED,
    resourceType: AUDIT_RESOURCE_TYPES.ENTITY_TYPE,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change,
  });
  return { result: { typeId: p.resourceId, status } };
}

async function deleteEntityTypeCommand(transaction, db, ctx) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'ENTITY_TYPE');
  if (existing.category === ENTITY_TYPE_CATEGORIES.CORE) fail(CODES.ADMIN_FORBIDDEN, 'Core Entity Types cannot be deleted.');
  transaction.delete(ref);
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.ENTITY_TYPE_DELETED,
    resourceType: AUDIT_RESOURCE_TYPES.ENTITY_TYPE,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change: pickBeforeAfter(existing, { status: 'DELETED' }),
  });
  return { result: { typeId: p.resourceId, deleted: true } };
}

// ─── ENTITY ─────────────────────────────────────────────────────────────────

async function createEntityCommand(transaction, db, ctx) {
  const { command, now, actor, userId, workspaceId } = ctx;
  const p = command.payload;
  if (!p.name?.trim()) fail(CODES.COMMAND_INVALID, 'Entity name is required.');
  if (!p.entityTypeId) fail(CODES.COMMAND_INVALID, 'entityTypeId is required.');
  const typeSnap = ctx.preloaded;
  if (!typeSnap?.snap.exists) fail(CODES.RESOURCE_NOT_FOUND, 'Entity Type not found.');
  if (typeSnap.snap.data().status !== 'ACTIVE') fail(CODES.INVALID_STATE, 'Entity Type is not active.');
  const entityId = `ent_${generateId()}`;
  const value = createEntity({
    entityId,
    workspaceId,
    entityTypeId: p.entityTypeId,
    displayName: p.name.trim(),
    data: p.data || {},
    status: ENTITY_STATUSES.ACTIVE,
    createdBy: actor,
  });
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.ENTITY_CREATED,
    resourceType: AUDIT_RESOURCE_TYPES.ENTITY,
    resourceId: entityId,
    userId,
    timestamp: now,
    change: pickBeforeAfter(null, value),
  });
  transaction.set(db.doc(`workspaces/${workspaceId}/entities/${entityId}`), {
    ...value,
    _createdAt: FieldValue.serverTimestamp(),
    _updatedAt: FieldValue.serverTimestamp(),
  });
  return { result: { entityId } };
}

async function updateEntityCommand(transaction, db, ctx) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'ENTITY');
  if (existing.status === ENTITY_STATUSES.ARCHIVED) fail(CODES.INVALID_STATE, 'Archived entities cannot be edited. Restore first.');
  const changes = {};
  for (const key of ['displayName', 'data']) {
    if (p[key] !== undefined) changes[key] = p[key];
  }
  if (!Object.keys(changes).length) fail(CODES.COMMAND_INVALID, 'Nothing to update.');
  const change = pickBeforeAfter(existing, changes);
  transaction.update(ref, { ...changes, _updatedAt: FieldValue.serverTimestamp() });
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.ENTITY_UPDATED,
    resourceType: AUDIT_RESOURCE_TYPES.ENTITY,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change,
  });
  return { result: { entityId: p.resourceId } };
}

async function lifecycleEntityCommand(transaction, db, ctx, direction) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'ENTITY');
  const status = direction === 'archive' ? 'ARCHIVED' : 'ACTIVE';
  if (existing.status === status) return { result: { entityId: p.resourceId }, idempotentNoop: true };
  const change = pickBeforeAfter(existing, { status });
  transaction.update(ref, { status, _updatedAt: FieldValue.serverTimestamp() });
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: direction === 'archive' ? AUDIT_ACTIONS.ENTITY_ARCHIVED : AUDIT_ACTIONS.ENTITY_RESTORED,
    resourceType: AUDIT_RESOURCE_TYPES.ENTITY,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change,
  });
  return { result: { entityId: p.resourceId, status } };
}

async function deleteEntityCommand(transaction, db, ctx) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'ENTITY');
  transaction.delete(ref);
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.ENTITY_DELETED,
    resourceType: AUDIT_RESOURCE_TYPES.ENTITY,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change: pickBeforeAfter(existing, { status: 'DELETED' }),
  });
  return { result: { entityId: p.resourceId, deleted: true } };
}

// ─── MODULE ─────────────────────────────────────────────────────────────────

async function createModuleCommand(transaction, db, { userId, command, now, actor, workspaceId }) {
  const p = command.payload;
  if (!p.name?.trim()) fail(CODES.COMMAND_INVALID, 'Module name is required.');
  if (p.formSchema) {
    const fr = validateFormSchema(p.formSchema);
    if (!fr.valid) fail(CODES.COMMAND_INVALID, `Invalid form schema: ${fr.errors.join('; ')}`);
  }
  const codes = await listModuleCodes(db, workspaceId);
  // Client may PROPOSE a moduleCode; server validates format and resolves
  // collisions against the existing reservation set.
  const proposed = typeof p.moduleCode === 'string' && p.moduleCode.trim() ? p.moduleCode.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_') : null;
  const moduleCode = resolveCodeCollision(proposed || generateTechnicalCode(p.name), codes);
  const moduleId = generateId();
  const value = createModule({
    moduleId,
    workspaceId,
    moduleCode,
    name: p.name.trim(),
    description: p.description || '',
    category: '',
    categoryId: p.categoryId ?? null,
    status: 'DRAFT',
    version: 1,
    formSchema: p.formSchema || { schemaVersion: '1.0.0', fields: [] },
    displayConfig: p.displayConfig || {},
    primaryEntityTypeId: p.primaryEntityTypeId ?? null,
    createdBy: actor,
  });
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.MODULE_CREATED,
    resourceType: AUDIT_RESOURCE_TYPES.MODULE,
    resourceId: moduleId,
    userId,
    timestamp: now,
    change: pickBeforeAfter(null, value),
  });
  const codeRef = db.doc(`workspaces/${workspaceId}/moduleCodes/${moduleCode}`);
  transaction.set(codeRef, { moduleCode, moduleId, workspaceId, reservedBy: actor, reservedAt: FieldValue.serverTimestamp() });
  transaction.set(db.doc(`workspaces/${workspaceId}/modules/${moduleId}`), { ...value, _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
  return { result: { moduleId, moduleCode } };
}

async function listModuleCodes(db, workspaceId) {
  const snap = await db.collection(`workspaces/${workspaceId}/moduleCodes`).limit(500).get();
  return snap.docs.map((d) => d.id);
}

async function updateModuleCommand(transaction, db, ctx) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'MODULE');
  if (existing.status === 'ARCHIVED') fail(CODES.INVALID_STATE, 'Archived Modules cannot be modified. Restore first.');
  const changes = {};
  for (const key of ['name', 'description', 'categoryId', 'displayConfig', 'primaryEntityTypeId']) {
    if (p[key] !== undefined) changes[key] = p[key];
  }
  if (p.primaryEntityTypeId === null) delete changes.primaryEntityTypeId;
  if (!Object.keys(changes).length) fail(CODES.COMMAND_INVALID, 'Nothing to update.');
  const change = pickBeforeAfter(existing, changes);
  transaction.update(ref, { ...changes, _updatedAt: FieldValue.serverTimestamp() });
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.MODULE_UPDATED,
    resourceType: AUDIT_RESOURCE_TYPES.MODULE,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change,
  });
  return { result: { moduleId: p.resourceId } };
}

async function lifecycleModuleCommand(transaction, db, ctx, direction) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'MODULE');
  const status = direction === 'archive' ? 'ARCHIVED' : 'ACTIVE';
  if (existing.status === status) return { result: { moduleId: p.resourceId }, idempotentNoop: true };
  const change = pickBeforeAfter(existing, { status });
  transaction.update(ref, { status, _updatedAt: FieldValue.serverTimestamp() });
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: direction === 'archive' ? AUDIT_ACTIONS.MODULE_ARCHIVED : AUDIT_ACTIONS.MODULE_RESTORED,
    resourceType: AUDIT_RESOURCE_TYPES.MODULE,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change,
  });
  return { result: { moduleId: p.resourceId, status } };
}

async function deleteModuleCommand(transaction, db, ctx) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'MODULE');
  transaction.delete(ref);
  const codeRef = db.doc(`workspaces/${workspaceId}/moduleCodes/${existing.moduleCode}`);
  transaction.delete(codeRef);
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.MODULE_DELETED,
    resourceType: AUDIT_RESOURCE_TYPES.MODULE,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change: pickBeforeAfter(existing, { status: 'DELETED' }),
  });
  return { result: { moduleId: p.resourceId, deleted: true } };
}

// ─── MODULE CATEGORY ────────────────────────────────────────────────────────

async function createModuleCategoryCommand(transaction, db, { userId, command, now, actor, workspaceId }) {
  const p = command.payload;
  if (!p.displayName?.trim()) fail(CODES.COMMAND_INVALID, 'Category display name is required.');
  const codes = await listCategoryCodes(db, workspaceId);
  const categoryCode = resolveCodeCollision(generateTechnicalCode(p.displayName), codes);
  const categoryId = `cat_${generateId()}`;
  const value = createModuleCategory({
    categoryId,
    workspaceId,
    displayName: p.displayName.trim(),
    categoryCode,
    description: p.description || '',
    status: MODULE_CATEGORY_STATUSES.ACTIVE,
    createdBy: actor,
  });
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.MODULE_CATEGORY_CREATED,
    resourceType: AUDIT_RESOURCE_TYPES.MODULE_CATEGORY,
    resourceId: categoryId,
    userId,
    timestamp: now,
    change: pickBeforeAfter(null, value),
  });
  transaction.set(db.doc(`workspaces/${workspaceId}/moduleCategories/${categoryId}`), { ...value, _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
  return { result: { categoryId, categoryCode } };
}

async function listCategoryCodes(db, workspaceId) {
  const snap = await db.collection(`workspaces/${workspaceId}/moduleCategories`).limit(500).get();
  return snap.docs.map((d) => d.data().categoryCode).filter(Boolean);
}

async function updateModuleCategoryCommand(transaction, db, ctx) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'MODULE_CATEGORY');
  const changes = {};
  for (const key of ['displayName', 'description', 'sortOrder']) {
    if (p[key] !== undefined) changes[key] = p[key];
  }
  if (!Object.keys(changes).length) fail(CODES.COMMAND_INVALID, 'Nothing to update.');
  const change = pickBeforeAfter(existing, changes);
  transaction.update(ref, { ...changes, _updatedAt: FieldValue.serverTimestamp() });
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.MODULE_CATEGORY_UPDATED,
    resourceType: AUDIT_RESOURCE_TYPES.MODULE_CATEGORY,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change,
  });
  return { result: { categoryId: p.resourceId } };
}

async function lifecycleCategoryCommand(transaction, db, ctx, direction) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'MODULE_CATEGORY');
  const status = direction === 'archive' ? 'ARCHIVED' : 'ACTIVE';
  if (existing.status === status) return { result: { categoryId: p.resourceId }, idempotentNoop: true };
  const change = pickBeforeAfter(existing, { status });
  transaction.update(ref, { status, _updatedAt: FieldValue.serverTimestamp() });
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: direction === 'archive' ? AUDIT_ACTIONS.MODULE_CATEGORY_ARCHIVED : AUDIT_ACTIONS.MODULE_CATEGORY_RESTORED,
    resourceType: AUDIT_RESOURCE_TYPES.MODULE_CATEGORY,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change,
  });
  return { result: { categoryId: p.resourceId, status } };
}

async function deleteModuleCategoryCommand(transaction, db, ctx) { const { command, now, userId, workspaceId } = ctx;
  const p = command.payload;
  const { ref, data: existing } = requireLoaded(ctx, 'MODULE_CATEGORY');
  transaction.delete(ref);
  writeAdminAuditInTransaction(transaction, db, workspaceId, {
    operationId: command.operationId,
    action: AUDIT_ACTIONS.MODULE_CATEGORY_DELETED,
    resourceType: AUDIT_RESOURCE_TYPES.MODULE_CATEGORY,
    resourceId: p.resourceId,
    userId,
    timestamp: now,
    change: pickBeforeAfter(existing, { status: 'DELETED' }),
  });
  return { result: { categoryId: p.resourceId, deleted: true } };
}

