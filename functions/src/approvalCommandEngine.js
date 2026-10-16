/**
 * Trusted Approval Command Engine (Step 31)
 *
 * Server-authoritative executor for canonical ApprovalDefinition,
 * ApprovalCase and ActionCard projection operations. Mirrors the
 * recordCommand/fileCommand boundary:
 *
 *   validate envelope → workspace authorization → operation journal
 *   → ONE Firestore transaction (domain write + journal COMPLETED +
 *     BusinessEvent + AuditEntry) → notifications → trusted action dispatch
 *
 * Approval authorizes; it never executes business mutation itself. When the
 * final step approves, the embedded closed action re-enters the canonical
 * trusted command boundary (e.g. recordCommand) under a deterministic
 * `exec_{operationId}` operation id — retries converge through the embedded
 * command's own operation journal.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import {
  validateApprovalCommand,
  APPROVAL_COMMAND_TYPES,
  APPROVAL_COMMAND_ERROR_CODES,
} from './generated/src/core/approvals/approvalCommandContract.js';
import {
  buildApprovalCaseFromCommand,
  buildApprovalDefinitionFromCommand,
  buildDefinitionUpdatePatch,
  applyDecisionToCase,
  buildCancellationPatch,
  buildExpiryPatch,
  buildExecutionMarkerPatch,
  snapshotSteps,
} from './generated/src/core/approvals/approvalCommandEngine.js';
import {
  evaluateApprovalAction,
  validateApproverAssignments,
  isApprovalExpired,
  isProposalStale,
} from './generated/src/core/approvals/approvalActionPolicy.js';
import {
  APPROVAL_STATUSES,
  EXECUTION_STATUSES,
} from './generated/src/core/approvals/approvalCase.js';
import {
  APPROVAL_SUBJECT_TYPES,
  approvalSubjectDocPath,
  subjectRevisionOf,
  canonicalProposalMaterial,
  executionOperationIdFor,
  SELF_APPROVAL_POLICIES,
} from './generated/src/core/approvals/approvalConstraints.js';
import {
  buildApprovalActionCard,
  actionCardIdForApproval,
  buildActionCardClosePatch,
} from './generated/src/core/actionCards/actionCard.js';
import { createAuditEntry } from './generated/src/core/audit/auditEntry.js';
import {
  createBusinessEvent,
  businessEventIdFor,
  BUSINESS_EVENT_TYPES,
  BUSINESS_EVENT_SOURCES,
} from './generated/src/core/events/businessEvent.js';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  AUDIT_SOURCES,
} from './generated/src/core/audit/auditActions.js';
import {
  RECORD_COMMAND_CONTRACT_VERSION,
} from './generated/src/core/recordCommands/recordCommandContract.js';
import { processNotificationIntent } from './notificationEngine.js';
import {
  NOTIFICATION_EVENT_TYPES,
  RECIPIENT_STRATEGIES,
} from './generated/src/core/notifications/notificationContract.js';
import {
  OPERATION_STATUS,
  OPERATION_LEASE_MS,
  MAX_RECOVERY_ATTEMPTS,
  computeOperationFingerprint,
  operationDoc,
  buildOperationDocument,
  peekCompletedOperation,
  stableJson,
} from './operationJournal.js';

const fail = (code, message, details = {}) => {
  const httpCode =
    code === APPROVAL_COMMAND_ERROR_CODES.UNAUTHENTICATED ? 'unauthenticated'
    : code === APPROVAL_COMMAND_ERROR_CODES.WORKSPACE_NOT_FOUND || code === APPROVAL_COMMAND_ERROR_CODES.APPROVAL_NOT_FOUND || code === APPROVAL_COMMAND_ERROR_CODES.DEFINITION_NOT_FOUND || code === APPROVAL_COMMAND_ERROR_CODES.SUBJECT_NOT_FOUND ? 'not-found'
    : code === APPROVAL_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN || code === APPROVAL_COMMAND_ERROR_CODES.ACTION_NOT_ALLOWED || code === APPROVAL_COMMAND_ERROR_CODES.NOT_ASSIGNED_APPROVER || code === APPROVAL_COMMAND_ERROR_CODES.APPROVER_NOT_AUTHORIZED || code === APPROVAL_COMMAND_ERROR_CODES.SELF_APPROVAL_DENIED || code === APPROVAL_COMMAND_ERROR_CODES.CANCELLATION_FORBIDDEN ? 'permission-denied'
    : code === APPROVAL_COMMAND_ERROR_CODES.OPERATION_CONFLICT || code === APPROVAL_COMMAND_ERROR_CODES.OPERATION_MISMATCH ? 'already-exists'
    : 'failed-precondition';
  throw new HttpsError(httpCode, message, { code, ...details });
};

function caseDoc(db, workspaceId, approvalCaseId) {
  return db.doc(`workspaces/${workspaceId}/approvalCases/${approvalCaseId}`);
}
function definitionDoc(db, workspaceId, approvalDefinitionId) {
  return db.doc(`workspaces/${workspaceId}/approvalDefinitions/${approvalDefinitionId}`);
}
function cardDoc(db, workspaceId, actionCardId) {
  return db.doc(`workspaces/${workspaceId}/actionCards/${actionCardId}`);
}

async function loadWorkspace(db, workspaceId) {
  const snap = await db.doc(`workspaces/${workspaceId}`).get();
  return snap.exists ? snap.data() : null;
}

async function authorizeWorkspace(db, workspaceId, userId) {
  const workspace = await loadWorkspace(db, workspaceId);
  if (!workspace) fail(APPROVAL_COMMAND_ERROR_CODES.WORKSPACE_NOT_FOUND, 'Workspace not found.');

  if (workspace.type === 'PERSONAL') {
    if (workspace.ownerUserId !== userId) {
      fail(APPROVAL_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN, 'Only the Personal Workspace owner may manage Approvals.');
    }
    return { workspace, authority: 'PERSONAL_OWNER' };
  }
  if (workspace.type === 'ORGANIZATION') {
    const member = await db.doc(`organizations/${workspace.organizationId}/members/${userId}`).get();
    if (!member.exists || member.data().status !== 'ACTIVE') {
      fail(APPROVAL_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN, 'Active workspace membership is required.');
    }
    return { workspace, authority: 'ORGANIZATION_MEMBER', member: member.data() };
  }
  fail(APPROVAL_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN, 'Unsupported workspace type.');
}

/** Decision-time authority re-check: assignment is not permanent authority. */
async function assertActiveMember(db, workspace, userId, code) {
  if (workspace.type === 'PERSONAL') {
    if (workspace.ownerUserId !== userId) fail(code, 'Only the Personal Workspace owner may act.');
    return;
  }
  const member = await db.doc(`organizations/${workspace.organizationId}/members/${userId}`).get();
  if (!member.exists || member.data().status !== 'ACTIVE') {
    fail(code, 'Approver is not an active workspace member.');
  }
}

function writeAuditInTransaction(transaction, db, workspaceId, { operationId, action, resourceType, resourceId, userId, metadata, timestamp }) {
  const entry = createAuditEntry({
    auditEntryId: `op_${operationId}_${action}`,
    workspaceId,
    actor: { actorType: 'USER', actorId: userId },
    action,
    resourceType,
    resourceId,
    timestamp,
    metadata: { ...(metadata || {}), operationId },
    source: AUDIT_SOURCES.WEB,
    correlationId: `op:${operationId}`,
  });
  transaction.set(db.doc(`workspaces/${workspaceId}/auditEntries/op_${operationId}_${action}`), {
    ...entry,
    _timestamp: FieldValue.serverTimestamp(),
  });
}

function writeBusinessEventInTransaction(transaction, db, workspaceId, { operationId, eventType, userId, objectReference, payload, causeEventId = null }) {
  const eventId = businessEventIdFor(operationId, eventType);
  transaction.set(
    db.doc(`workspaces/${workspaceId}/businessEvents/${eventId}`),
    createBusinessEvent({
      eventId,
      eventType,
      workspaceId,
      source: BUSINESS_EVENT_SOURCES.APPROVAL_COMMAND,
      actor: { actorType: 'USER', actorId: userId },
      objectReference,
      payload,
      idempotencyKey: operationId,
      correlationId: operationId,
      causeEventId,
    }),
  );
}

function writeCardInTransaction(transaction, db, workspaceId, card) {
  transaction.set(cardDoc(db, workspaceId, card.actionCardId), { ...card, _createdAt: FieldValue.serverTimestamp() });
}

function closeStepCardsInTransaction(transaction, db, workspaceId, approvalCase, stepIndex, userIds, now) {
  for (const uid of userIds) {
    transaction.update(
      cardDoc(db, workspaceId, actionCardIdForApproval(approvalCase.approvalCaseId, stepIndex, uid)),
      { ...buildActionCardClosePatch({ now }), _closedAt: FieldValue.serverTimestamp() },
    );
  }
}

function caseObjectRef(workspaceId, approvalCaseId) {
  return { type: 'APPROVAL_CASE', id: approvalCaseId, workspaceId };
}

/**
 * Builds the embedded trusted command for a closed proposed action.
 * The server assigns the deterministic execution operationId and pins the
 * workspace — the client never supplies either.
 */
function buildEmbeddedCommand({ proposedAction, approvalOperationId, workspaceId }) {
  if (proposedAction.actionType !== 'RECORD_COMMAND') {
    fail(APPROVAL_COMMAND_ERROR_CODES.UNSUPPORTED_ACTION, `Unsupported proposed action: ${proposedAction.actionType}`);
  }
  return {
    contractVersion: RECORD_COMMAND_CONTRACT_VERSION,
    commandType: proposedAction.command.commandType,
    operationId: executionOperationIdFor(approvalOperationId),
    payload: { ...proposedAction.command.payload, workspaceId },
  };
}

async function notifyBestEffort(db, intent) {
  try {
    await processNotificationIntent(db, intent);
  } catch {
    // Notification delivery must never corrupt the committed approval state.
  }
}

async function notifyApprovers(db, { workspaceId, approvalCase, approverUserIds, operationId }) {
  for (const uid of approverUserIds) {
    await notifyBestEffort(db, {
      eventType: NOTIFICATION_EVENT_TYPES.APPROVAL_REQUESTED,
      workspaceId,
      actorUserId: approvalCase.requestedBy.actorId,
      operationId,
      recipientStrategy: { type: RECIPIENT_STRATEGIES.EXPLICIT_USER, userId: uid },
      contextReference: { type: 'APPROVAL_CASE', id: approvalCase.approvalCaseId, workspaceId },
      metadata: { title: approvalCase.title, stepIndex: approvalCase.currentStepIndex },
    });
  }
}

async function notifyRequesterResolved(db, { workspaceId, approvalCase, operationId }) {
  await notifyBestEffort(db, {
    eventType: NOTIFICATION_EVENT_TYPES.APPROVAL_RESOLVED,
    workspaceId,
    actorUserId: approvalCase.requestedBy.actorId,
    operationId,
    recipientStrategy: { type: RECIPIENT_STRATEGIES.EXPLICIT_USER, userId: approvalCase.requestedBy.actorId },
    contextReference: { type: 'APPROVAL_CASE', id: approvalCase.approvalCaseId, workspaceId },
    metadata: { title: approvalCase.title, status: approvalCase.status },
  });
}

/**
 * Dispatches the embedded trusted action for an APPROVED case.
 * The executor is an injected closed-registry function (index.js wires
 * RECORD_COMMAND → executeRecordCommand). Exactly-once comes from the
 * deterministic exec_ operationId + the embedded engine's own journal.
 * Returns { executed, error? }.
 */
async function dispatchEmbeddedAction({ db, approvalCase, actionExecutors }) {
  if (approvalCase.status !== APPROVAL_STATUSES.APPROVED) return { executed: false };
  if (approvalCase.execution?.status === EXECUTION_STATUSES.EXECUTED) return { executed: true };
  const executor = actionExecutors?.[approvalCase.proposedAction?.actionType];
  if (!executor) {
    return { executed: false, error: `No trusted executor registered for ${approvalCase.proposedAction?.actionType}` };
  }
  const execCommand = buildEmbeddedCommand({
    proposedAction: approvalCase.proposedAction,
    approvalOperationId: approvalCase.correlationId || approvalCase.approvalCaseId.replace(/^appr_/, ''),
    workspaceId: approvalCase.workspaceId,
  });
  try {
    const result = await executor({ userId: approvalCase.requestedBy.actorId, command: execCommand });
    const resourcePath = result?.resourcePath || result?.operationId || null;
    await caseDoc(db, approvalCase.workspaceId, approvalCase.approvalCaseId).update({
      ...buildExecutionMarkerPatch({ resourcePath, now: new Date().toISOString() }),
      _updatedAt: FieldValue.serverTimestamp(),
    });
    return { executed: true, resourcePath };
  } catch (err) {
    // The approval is committed; the execution stays PENDING_EXECUTION and a
    // DECIDE replay re-attempts it. Surface the error without corrupting state.
    console.error('approval embedded execution failed', err?.message || err);
    return { executed: false, error: err?.message || 'execution failed' };
  }
}

/**
 * Replay-side convergence: a completed DECIDE whose approval is APPROVED but
 * whose execution marker never landed retries the embedded action — its own
 * journal guarantees the business effect happens exactly once.
 */
async function resumeApprovedExecution({ db, workspaceId, approvalCaseId, actionExecutors }) {
  const snap = await caseDoc(db, workspaceId, approvalCaseId).get();
  if (!snap.exists) return { executed: false };
  const approvalCase = snap.data();
  if (approvalCase.status !== APPROVAL_STATUSES.APPROVED) return { executed: false };
  return dispatchEmbeddedAction({ db, approvalCase, actionExecutors });
}

export async function executeApprovalCommand(db, { userId, command, actionExecutors = {} }) {
  if (!userId) fail(APPROVAL_COMMAND_ERROR_CODES.UNAUTHENTICATED, 'Authentication required.');

  const envelope = validateApprovalCommand(command);
  if (!envelope.valid) {
    fail(envelope.code || APPROVAL_COMMAND_ERROR_CODES.OPERATION_INVALID, envelope.errors.join('; '));
  }

  const { workspaceId } = command.payload;
  const fingerprint = computeOperationFingerprint(userId, command);
  const authz = await authorizeWorkspace(db, workspaceId, userId);
  const commandType = command.commandType;
  const opRef = operationDoc(db, workspaceId, command.operationId);
  const actorContext = { authenticated: true, workspaceAccess: authz.authority };
  const actor = { actorType: 'USER', actorId: userId };

  // Journal replay FIRST: a COMPLETED op with matching identity + fingerprint
  // returns its recorded result. For DECIDE replays we also converge the
  // embedded execution if its marker never landed (crash after commit).
  const replay = await peekCompletedOperation(db, {
    workspaceId,
    operationId: command.operationId,
    userId,
    fingerprint,
    fail,
    codes: APPROVAL_COMMAND_ERROR_CODES,
  });
  if (replay?.replay) {
    const snap = await db.doc(`workspaces/${workspaceId}/${replay.recordId}`).get();
    if (!snap.exists) {
      fail(APPROVAL_COMMAND_ERROR_CODES.OPERATION_FAILED, 'Operation is completed but has no resource reference.');
    }
    let execution = null;
    if (commandType === APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL && replay.recordId.startsWith('approvalCases/')) {
      execution = await resumeApprovedExecution({
        db, workspaceId, approvalCaseId: replay.recordId.split('/')[1], actionExecutors,
      });
    }
    return { resource: snap.data(), operationId: command.operationId, idempotent: true, execution };
  }

  const now = new Date().toISOString();
  const domain = await resolveDomain(db, command, { userId, workspaceId, now });

  const result = await db.runTransaction(async (transaction) => {
    const opSnap = await transaction.get(opRef);
    if (opSnap.exists) {
      const op = opSnap.data();
      if (op.userId !== userId || op.workspaceId !== workspaceId) {
        fail(APPROVAL_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Operation identity mismatch.');
      }
      if (op.fingerprint !== fingerprint) {
        fail(APPROVAL_COMMAND_ERROR_CODES.OPERATION_MISMATCH, 'Operation command mismatch.');
      }
      if (op.status === OPERATION_STATUS.COMPLETED) {
        const snap = await transaction.get(db.doc(`workspaces/${workspaceId}/${op.recordId}`));
        if (!snap.exists) fail(APPROVAL_COMMAND_ERROR_CODES.OPERATION_FAILED, 'Operation completed but resource missing.');
        return { resource: snap.data(), idempotent: true, resourcePath: op.recordId };
      }
      if (op.status === OPERATION_STATUS.PROCESSING) {
        const leaseExpired = !op.leaseExpiresAt || op.leaseExpiresAt.toMillis() <= Timestamp.now().toMillis();
        if (!leaseExpired) return { status: OPERATION_STATUS.PROCESSING };
        const attemptCount = (op.attemptCount || 1) + 1;
        if (attemptCount > MAX_RECOVERY_ATTEMPTS) {
          fail(APPROVAL_COMMAND_ERROR_CODES.OPERATION_FAILED, 'Operation recovery limit exceeded.');
        }
        transaction.update(opRef, {
          status: OPERATION_STATUS.PROCESSING,
          attemptCount,
          leaseExpiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + OPERATION_LEASE_MS),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        fail(APPROVAL_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Operation exists with terminal or failed status.');
      }
    } else {
      transaction.set(opRef, buildOperationDocument({ command, userId, fingerprint, status: OPERATION_STATUS.PROCESSING }));
    }

    if (commandType === APPROVAL_COMMAND_TYPES.CREATE_APPROVAL_DEFINITION) {
      return createDefinitionInTransaction(transaction, db, { command, userId, workspaceId, now });
    }
    if (commandType === APPROVAL_COMMAND_TYPES.UPDATE_APPROVAL_DEFINITION) {
      return updateDefinitionInTransaction(transaction, db, { command, userId, workspaceId, now });
    }
    if (commandType === APPROVAL_COMMAND_TYPES.CREATE_APPROVAL) {
      return createApprovalInTransaction(transaction, db, { command, userId, workspaceId, domain, now });
    }
    if (commandType === APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL) {
      return decideApprovalInTransaction(transaction, db, { command, userId, workspaceId, authz, actorContext, actor, now });
    }
    // CANCEL_APPROVAL
    return cancelApprovalInTransaction(transaction, db, { command, userId, workspaceId, authz, actorContext, actor, now });
  });

  if (result.status === OPERATION_STATUS.PROCESSING) {
    fail(APPROVAL_COMMAND_ERROR_CODES.OPERATION_IN_PROGRESS, 'The same operation is already being processed.');
  }

  // Post-commit side effects — notifications and the approved action dispatch
  // are derived consequences; they never invalidate the canonical commit.
  const approvalCase = result.approvalCase;
  let execution = null;
  if (commandType === APPROVAL_COMMAND_TYPES.CREATE_APPROVAL && approvalCase) {
    const step = approvalCase.steps[0];
    await notifyApprovers(db, {
      workspaceId, approvalCase, approverUserIds: step.assignments.map((a) => a.approverUserId), operationId: command.operationId,
    });
  }
  if (commandType === APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL && approvalCase) {
    if (approvalCase.status === APPROVAL_STATUSES.APPROVED) {
      execution = await dispatchEmbeddedAction({ db, approvalCase, actionExecutors });
      await notifyRequesterResolved(db, { workspaceId, approvalCase, operationId: command.operationId });
    } else if (approvalCase.status === APPROVAL_STATUSES.REJECTED) {
      await notifyRequesterResolved(db, { workspaceId, approvalCase, operationId: command.operationId });
    } else if (approvalCase.status === APPROVAL_STATUSES.PENDING) {
      const step = approvalCase.steps[approvalCase.currentStepIndex];
      if (result.caseOutcome === 'ADVANCED') {
        await notifyApprovers(db, {
          workspaceId, approvalCase, approverUserIds: step.assignments.map((a) => a.approverUserId), operationId: command.operationId,
        });
      }
    }
  }
  if (commandType === APPROVAL_COMMAND_TYPES.CANCEL_APPROVAL && approvalCase && approvalCase.requestedBy.actorId !== userId) {
    await notifyRequesterResolved(db, { workspaceId, approvalCase, operationId: command.operationId });
  }

  return { resource: result.resource, operationId: command.operationId, idempotent: result.idempotent === true, execution };
}

/** Pre-transaction domain resolution (fresh state re-verified in-transaction). */
async function resolveDomain(db, command, { userId, workspaceId, now }) {
  const p = command.payload;
  const domain = {};
  if (command.commandType === APPROVAL_COMMAND_TYPES.UPDATE_APPROVAL_DEFINITION) {
    domain.definition = (await definitionDoc(db, workspaceId, p.approvalDefinitionId).get()).data() || null;
  }
  if (command.commandType === APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL
    || command.commandType === APPROVAL_COMMAND_TYPES.CANCEL_APPROVAL) {
    domain.approvalCase = (await caseDoc(db, workspaceId, p.approvalCaseId).get()).data() || null;
  }
  if (command.commandType === APPROVAL_COMMAND_TYPES.CREATE_APPROVAL) {
    // Definition or inline steps
    if (p.definitionId) {
      const def = (await definitionDoc(db, workspaceId, p.definitionId).get()).data() || null;
      if (!def || def.workspaceId !== workspaceId) {
        fail(APPROVAL_COMMAND_ERROR_CODES.DEFINITION_NOT_FOUND, 'Approval definition not found.');
      }
      if (def.status !== 'ACTIVE') {
        fail(APPROVAL_COMMAND_ERROR_CODES.ACTION_NOT_ALLOWED, 'Approval definition is not ACTIVE.');
      }
      if (def.requestType && def.requestType !== p.requestType) {
        fail(APPROVAL_COMMAND_ERROR_CODES.ACTION_NOT_ALLOWED, 'Approval definition does not apply to this request type.');
      }
      domain.definition = def;
      domain.stepSpecs = def.steps;
      domain.selfApprovalPolicy = def.selfApprovalPolicy || SELF_APPROVAL_POLICIES.FORBID;
      domain.definitionRef = { definitionId: def.approvalDefinitionId, version: def.version };
      domain.expiresAt = p.expiresAt
        || (def.defaultExpiresInMs ? new Date(Date.parse(now) + def.defaultExpiresInMs).toISOString() : null);
    } else {
      domain.stepSpecs = p.steps;
      domain.selfApprovalPolicy = p.selfApprovalPolicy || SELF_APPROVAL_POLICIES.FORBID;
      domain.expiresAt = p.expiresAt || null;
    }
    // Approver governance: self-approval policy + canonical membership.
    const selfCheck = validateApproverAssignments({
      stepSpecs: domain.stepSpecs,
      requesterUserId: userId,
      selfApprovalPolicy: domain.selfApprovalPolicy,
    });
    if (!selfCheck.ok) fail(selfCheck.reasonCode, 'The requester cannot approve their own request under this policy.');
    const ws = await loadWorkspace(db, workspaceId);
    for (const spec of domain.stepSpecs) {
      for (const approverId of spec.approverUserIds) {
        await assertActiveMember(db, ws, approverId, APPROVAL_COMMAND_ERROR_CODES.APPROVER_NOT_AUTHORIZED);
      }
    }
    // Subject resolution + revision capture (stale-state protection).
    if (p.subject) {
      const path = approvalSubjectDocPath(p.subject.type, workspaceId, p.subject.id);
      if (!path) fail(APPROVAL_COMMAND_ERROR_CODES.UNSUPPORTED_TARGET, 'Unsupported approval subject type.');
      const snap = await db.doc(path).get();
      if (!snap.exists || snap.data().workspaceId !== workspaceId) {
        fail(APPROVAL_COMMAND_ERROR_CODES.SUBJECT_NOT_FOUND, 'Approval subject not found in this workspace.');
      }
      domain.subjectRevision = subjectRevisionOf(p.subject.type, snap.data());
    }
    // Deterministic proposal fingerprint over canonical material.
    domain.proposalFingerprint = createHash('sha256').update(stableJson(canonicalProposalMaterial({
      requestType: p.requestType,
      subject: p.subject ? { type: p.subject.type, id: p.subject.id, revision: domain.subjectRevision ?? null } : null,
      proposedAction: {
        actionType: p.proposedAction.actionType,
        command: { commandType: p.proposedAction.command?.commandType, payload: p.proposedAction.command?.payload },
      },
    }))).digest('hex');
  }
  return domain;
}

function createDefinitionInTransaction(transaction, db, { command, userId, workspaceId, now }) {
  const definition = buildApprovalDefinitionFromCommand({ command, actorId: userId, now });
  const ref = definitionDoc(db, workspaceId, definition.approvalDefinitionId);
  const resourcePath = `approvalDefinitions/${definition.approvalDefinitionId}`;
  return (async () => {
    const snap = await transaction.get(ref);
    if (snap.exists) fail(APPROVAL_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Approval definition already exists for this operation.');
    transaction.set(ref, { ...definition, _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
    writeAuditInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      action: AUDIT_ACTIONS.APPROVAL_DEFINITION_CREATED,
      resourceType: AUDIT_RESOURCE_TYPES.APPROVAL_DEFINITION,
      resourceId: definition.approvalDefinitionId,
      userId,
      metadata: { name: definition.name, version: 1 },
      timestamp: now,
    });
    transaction.update(operationDoc(db, workspaceId, command.operationId), { status: OPERATION_STATUS.COMPLETED, recordId: resourcePath, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { resource: definition, idempotent: false, resourcePath };
  })();
}

function updateDefinitionInTransaction(transaction, db, { command, userId, workspaceId, now }) {
  return (async () => {
    const ref = definitionDoc(db, workspaceId, command.payload.approvalDefinitionId);
    const snap = await transaction.get(ref);
    if (!snap.exists) fail(APPROVAL_COMMAND_ERROR_CODES.DEFINITION_NOT_FOUND, 'Approval definition not found.');
    const patch = buildDefinitionUpdatePatch({ command, definition: snap.data(), now });
    transaction.update(ref, { ...patch, _updatedAt: FieldValue.serverTimestamp() });
    writeAuditInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      action: AUDIT_ACTIONS.APPROVAL_DEFINITION_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.APPROVAL_DEFINITION,
      resourceId: command.payload.approvalDefinitionId,
      userId,
      metadata: { version: patch.version || snap.data().version },
      timestamp: now,
    });
    const resourcePath = `approvalDefinitions/${command.payload.approvalDefinitionId}`;
    transaction.update(operationDoc(db, workspaceId, command.operationId), { status: OPERATION_STATUS.COMPLETED, recordId: resourcePath, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { resource: { ...snap.data(), ...patch }, idempotent: false, resourcePath };
  })();
}

function createApprovalInTransaction(transaction, db, { command, userId, workspaceId, domain, now }) {
  return (async () => {
    const steps = snapshotSteps(domain.stepSpecs);
    const approvalCase = buildApprovalCaseFromCommand({
      command,
      actorId: userId,
      steps,
      subjectRevision: domain.subjectRevision ?? null,
      proposalFingerprint: domain.proposalFingerprint,
      definitionRef: domain.definitionRef || null,
      selfApprovalPolicy: domain.selfApprovalPolicy,
      expiresAt: domain.expiresAt,
      now,
    });
    const ref = caseDoc(db, workspaceId, approvalCase.approvalCaseId);
    const snap = await transaction.get(ref);
    if (snap.exists) fail(APPROVAL_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Approval case already exists for this operation.');
    transaction.set(ref, { ...approvalCase, _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
    // Action Cards for the first step's assignees — derived projection.
    for (const uid of steps[0].assignments.map((a) => a.approverUserId)) {
      writeCardInTransaction(transaction, db, workspaceId, buildApprovalActionCard({ approvalCase, approverUserId: uid, stepIndex: 0, now }));
    }
    writeBusinessEventInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      eventType: BUSINESS_EVENT_TYPES.APPROVAL_REQUESTED,
      userId,
      objectReference: caseObjectRef(workspaceId, approvalCase.approvalCaseId),
      payload: { title: approvalCase.title, requestType: approvalCase.requestType, stepCount: steps.length },
    });
    writeAuditInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      action: AUDIT_ACTIONS.APPROVAL_REQUESTED,
      resourceType: AUDIT_RESOURCE_TYPES.APPROVAL_CASE,
      resourceId: approvalCase.approvalCaseId,
      userId,
      metadata: { title: approvalCase.title, requestType: approvalCase.requestType },
      timestamp: now,
    });
    const resourcePath = `approvalCases/${approvalCase.approvalCaseId}`;
    transaction.update(operationDoc(db, workspaceId, command.operationId), { status: OPERATION_STATUS.COMPLETED, recordId: resourcePath, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { resource: approvalCase, approvalCase, idempotent: false, resourcePath };
  })();
}

function decideApprovalInTransaction(transaction, db, { command, userId, workspaceId, authz, actorContext, actor, now }) {
  return (async () => {
    const p = command.payload;
    const caseRef = caseDoc(db, workspaceId, p.approvalCaseId);
    const caseSnap = await transaction.get(caseRef);
    if (!caseSnap.exists) fail(APPROVAL_COMMAND_ERROR_CODES.APPROVAL_NOT_FOUND, 'Approval case not found.');
    const approvalCase = caseSnap.data();

    // Decision-time expiry — deterministic lazy detection.
    if (isApprovalExpired(approvalCase, now)) {
      const patch = buildExpiryPatch({ now });
      transaction.update(caseRef, { ...patch, _updatedAt: FieldValue.serverTimestamp() });
      closeStepCardsInTransaction(transaction, db, workspaceId, approvalCase, approvalCase.currentStepIndex,
        approvalCase.steps[approvalCase.currentStepIndex].assignments.map((a) => a.approverUserId), now);
      writeBusinessEventInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        eventType: BUSINESS_EVENT_TYPES.APPROVAL_EXPIRED,
        userId,
        objectReference: caseObjectRef(workspaceId, approvalCase.approvalCaseId),
        payload: { title: approvalCase.title },
      });
      writeAuditInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        action: AUDIT_ACTIONS.APPROVAL_EXPIRED,
        resourceType: AUDIT_RESOURCE_TYPES.APPROVAL_CASE,
        resourceId: approvalCase.approvalCaseId,
        userId,
        metadata: { title: approvalCase.title },
        timestamp: now,
      });
      const resourcePath = `approvalCases/${approvalCase.approvalCaseId}`;
      transaction.update(operationDoc(db, workspaceId, command.operationId), { status: OPERATION_STATUS.COMPLETED, recordId: resourcePath, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return { resource: { ...approvalCase, ...patch }, approvalCase: { ...approvalCase, ...patch }, idempotent: false, resourcePath };
    }

    const policy = evaluateApprovalAction({
      actorContext, actor, approvalCase, action: APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL, now,
    });
    if (!policy.allowed) fail(policy.reasonCode, 'Decision is not allowed for this approval.');

    // Temporal authority: assignment ≠ permanent authorization — re-check
    // active membership at decision time inside the same transaction read.
    if (authz.workspace.type === 'ORGANIZATION') {
      const memberSnap = await transaction.get(db.doc(`organizations/${authz.workspace.organizationId}/members/${userId}`));
      if (!memberSnap.exists || memberSnap.data().status !== 'ACTIVE') {
        fail(APPROVAL_COMMAND_ERROR_CODES.APPROVER_NOT_AUTHORIZED, 'Approver is not an active workspace member.');
      }
    }

    // Stale-state protection: the subject's material revision must still
    // match what was fingerprinted at case creation.
    if (approvalCase.subject && approvalCase.subject.type !== APPROVAL_SUBJECT_TYPES.NONE) {
      const subjectPath = approvalSubjectDocPath(approvalCase.subject.type, workspaceId, approvalCase.subject.id);
      const subjectSnap = await transaction.get(db.doc(subjectPath));
      const liveRevision = subjectSnap.exists ? subjectRevisionOf(approvalCase.subject.type, subjectSnap.data()) : null;
      if (subjectSnap.exists && subjectSnap.data().workspaceId !== workspaceId) {
        fail(APPROVAL_COMMAND_ERROR_CODES.SUBJECT_NOT_FOUND, 'Approval subject left the workspace.');
      }
      if (isProposalStale(approvalCase, liveRevision)) {
        fail(APPROVAL_COMMAND_ERROR_CODES.PROPOSAL_STALE, 'The approved proposal changed since it was reviewed.');
      }
    }

    const { decision, patch, stepOutcome, caseOutcome } = applyDecisionToCase({
      approvalCase,
      decision: p.decision,
      operationId: command.operationId,
      actorId: userId,
      now,
    });
    transaction.update(caseRef, { ...patch, _updatedAt: FieldValue.serverTimestamp() });

    const stepIndex = approvalCase.currentStepIndex;
    const stepAssignees = approvalCase.steps[stepIndex].assignments.map((a) => a.approverUserId);
    // The deciding assignee's card always closes; on step resolution every
    // pending assignee's card closes too.
    const cardCloses = stepOutcome === 'PENDING' ? [userId] : stepAssignees;
    closeStepCardsInTransaction(transaction, db, workspaceId, approvalCase, stepIndex, cardCloses, now);
    const nextCase = { ...approvalCase, ...patch };
    if (caseOutcome === 'ADVANCED') {
      for (const uid of patch.steps[patch.currentStepIndex].assignments.map((a) => a.approverUserId)) {
        writeCardInTransaction(transaction, db, workspaceId, buildApprovalActionCard({
          approvalCase: nextCase, approverUserId: uid, stepIndex: patch.currentStepIndex, now,
        }));
      }
    }

    // Decision audit evidence — always, for every recorded decision.
    writeAuditInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      action: AUDIT_ACTIONS.APPROVAL_DECIDED,
      resourceType: AUDIT_RESOURCE_TYPES.APPROVAL_CASE,
      resourceId: approvalCase.approvalCaseId,
      userId,
      metadata: { decision: p.decision, stepIndex, reason: p.reason || null },
      timestamp: now,
    });
    if (stepOutcome === 'COMPLETED') {
      writeBusinessEventInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        eventType: BUSINESS_EVENT_TYPES.APPROVAL_STEP_COMPLETED,
        userId,
        objectReference: caseObjectRef(workspaceId, approvalCase.approvalCaseId),
        payload: { stepIndex, title: approvalCase.title },
      });
    }
    if (caseOutcome === APPROVAL_STATUSES.APPROVED || caseOutcome === APPROVAL_STATUSES.REJECTED) {
      const eventType = caseOutcome === APPROVAL_STATUSES.APPROVED ? BUSINESS_EVENT_TYPES.APPROVAL_APPROVED : BUSINESS_EVENT_TYPES.APPROVAL_REJECTED;
      writeBusinessEventInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        eventType,
        userId,
        objectReference: caseObjectRef(workspaceId, approvalCase.approvalCaseId),
        payload: { title: approvalCase.title, decisionId: decision.decisionId },
      });
      writeAuditInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        action: caseOutcome === APPROVAL_STATUSES.APPROVED ? AUDIT_ACTIONS.APPROVAL_APPROVED : AUDIT_ACTIONS.APPROVAL_REJECTED,
        resourceType: AUDIT_RESOURCE_TYPES.APPROVAL_CASE,
        resourceId: approvalCase.approvalCaseId,
        userId,
        metadata: { title: approvalCase.title, decisionId: decision.decisionId },
        timestamp: now,
      });
    }
    const resourcePath = `approvalCases/${approvalCase.approvalCaseId}`;
    transaction.update(operationDoc(db, workspaceId, command.operationId), { status: OPERATION_STATUS.COMPLETED, recordId: resourcePath, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { resource: nextCase, approvalCase: nextCase, caseOutcome, idempotent: false, resourcePath };
  })();
}

function cancelApprovalInTransaction(transaction, db, { command, userId, workspaceId, actorContext, actor, now }) {
  return (async () => {
    const p = command.payload;
    const caseRef = caseDoc(db, workspaceId, p.approvalCaseId);
    const caseSnap = await transaction.get(caseRef);
    if (!caseSnap.exists) fail(APPROVAL_COMMAND_ERROR_CODES.APPROVAL_NOT_FOUND, 'Approval case not found.');
    const approvalCase = caseSnap.data();
    const policy = evaluateApprovalAction({
      actorContext, actor, approvalCase, action: APPROVAL_COMMAND_TYPES.CANCEL_APPROVAL, now,
    });
    if (!policy.allowed) fail(policy.reasonCode, 'Cancellation is not allowed for this approval.');
    const patch = buildCancellationPatch({ now });
    transaction.update(caseRef, { ...patch, _updatedAt: FieldValue.serverTimestamp() });
    closeStepCardsInTransaction(transaction, db, workspaceId, approvalCase, approvalCase.currentStepIndex,
      approvalCase.steps[approvalCase.currentStepIndex].assignments.map((a) => a.approverUserId), now);
    writeBusinessEventInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      eventType: BUSINESS_EVENT_TYPES.APPROVAL_CANCELLED,
      userId,
      objectReference: caseObjectRef(workspaceId, approvalCase.approvalCaseId),
      payload: { title: approvalCase.title },
    });
    writeAuditInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      action: AUDIT_ACTIONS.APPROVAL_CANCELLED,
      resourceType: AUDIT_RESOURCE_TYPES.APPROVAL_CASE,
      resourceId: approvalCase.approvalCaseId,
      userId,
      metadata: { title: approvalCase.title, reason: p.reason || null },
      timestamp: now,
    });
    const resourcePath = `approvalCases/${approvalCase.approvalCaseId}`;
    transaction.update(operationDoc(db, workspaceId, command.operationId), { status: OPERATION_STATUS.COMPLETED, recordId: resourcePath, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { resource: { ...approvalCase, ...patch }, approvalCase: { ...approvalCase, ...patch }, idempotent: false, resourcePath };
  })();
}
