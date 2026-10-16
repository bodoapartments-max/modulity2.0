import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeApprovalCommand } from './approvalCommandEngine.js';
import { executeRecordCommand } from './recordCommandEngine.js';
import { createFakeDb } from './fakeDbHarness.js';

function cmd(commandType, payload, operationId = 'op-1') {
  return { contractVersion: '1.0.0', operationId, commandType, payload: { workspaceId: 'ws-1', ...payload } };
}

const RECORD_ACTION = {
  actionType: 'RECORD_COMMAND',
  command: { commandType: 'SUBMIT_RECORD', payload: { recordId: 'rec-1' } },
};

function createPayload(overrides = {}) {
  return {
    requestType: 'TRUSTED_COMMAND',
    title: 'Approve this change',
    proposedAction: RECORD_ACTION,
    steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u-ben'] }],
    ...overrides,
  };
}

function decidePayload(overrides = {}) {
  return { approvalCaseId: 'appr_op-c1', decision: 'APPROVE', ...overrides };
}

/** ORGANIZATION workspace: u-anna requests, u-ben/u-carl approve, u-dave is suspended. */
function seedOrg() {
  return {
    'workspaces/ws-1': { workspaceId: 'ws-1', type: 'ORGANIZATION', organizationId: 'org-1' },
    'workspaces/ws-2': { workspaceId: 'ws-2', type: 'ORGANIZATION', organizationId: 'org-2' },
    'organizations/org-1/members/u-anna': { status: 'ACTIVE', roles: ['MEMBER'] },
    'organizations/org-1/members/u-ben': { status: 'ACTIVE', roles: ['MEMBER'] },
    'organizations/org-1/members/u-carl': { status: 'ACTIVE', roles: ['MEMBER'] },
    'organizations/org-1/members/u-dave': { status: 'SUSPENDED', roles: ['MEMBER'] },
    'organizations/org-2/members/u-anna': { status: 'ACTIVE', roles: ['MEMBER'] },
    'workspaces/ws-1/records/rec-1': { recordId: 'rec-1', workspaceId: 'ws-1', status: 'DRAFT', updatedAt: '2026-10-16T10:00:00.000Z' },
    'workspaces/ws-1/files/f_1': { fileId: 'f_1', workspaceId: 'ws-1', currentVersion: 3 },
  };
}

/** Journal-aware stub executor — proves exactly-once via exec_{opId} convergence. */
function makeExecutors() {
  const state = { mutations: 0, calls: [] };
  const executed = new Set();
  const actionExecutors = {
    RECORD_COMMAND: async ({ userId, command }) => {
      state.calls.push({ userId, operationId: command.operationId });
      if (executed.has(command.operationId)) return { idempotent: true, resourcePath: 'records/rec-1' };
      executed.add(command.operationId);
      state.mutations += 1;
      return { resourcePath: 'records/rec-1', operationId: command.operationId };
    },
  };
  return { actionExecutors, state };
}

function code(err) { return err?.details?.code || err?.code; }
function docKeys(db, prefix) { return [...db._docs.keys()].filter((k) => k.startsWith(prefix)); }

async function createCase(db, { operationId = 'op-c1', payload = createPayload(), userId = 'u-anna', extra = {} } = {}) {
  return executeApprovalCommand(db, { userId, command: cmd('CREATE_APPROVAL', payload, operationId), ...extra });
}

describe('approvalCommand — CREATE_APPROVAL', () => {
  it('creates a PENDING case with pinned steps, cards, event, audit and notification', async () => {
    const db = createFakeDb(seedOrg());
    const { actionExecutors } = makeExecutors();
    const result = await createCase(db, { extra: { actionExecutors } });
    assert.equal(result.idempotent, false);
    const c = result.resource;
    assert.equal(c.approvalCaseId, 'appr_op-c1');
    assert.equal(c.status, 'PENDING');
    assert.equal(c.requestedBy.actorId, 'u-anna');
    assert.equal(c.steps[0].assignments[0].approverUserId, 'u-ben');
    // Action Card projection for the assignee.
    assert.equal(db._docs.has('workspaces/ws-1/actionCards/ac_appr_op-c1_s0_u-ben'), true);
    // BusinessEvent + Audit in the same commit.
    assert.equal(docKeys(db, 'workspaces/ws-1/businessEvents/').some((k) => k.includes('approval.requested')), true);
    assert.equal(docKeys(db, 'workspaces/ws-1/auditEntries/').some((k) => k.includes('approval.requested')), true);
    // Canonical notification to the approver.
    assert.equal(docKeys(db, 'workspaces/ws-1/notifications/').length >= 1, true);
    // Journal completed.
    assert.equal(db._docs.get('workspaces/ws-1/recordOperations/op-c1').status, 'COMPLETED');
  });

  it('replay of the same create converges — one case, one card, one event', async () => {
    const db = createFakeDb(seedOrg());
    const { actionExecutors } = makeExecutors();
    await createCase(db, { extra: { actionExecutors } });
    const again = await createCase(db, { extra: { actionExecutors } });
    assert.equal(again.idempotent, true);
    assert.equal(docKeys(db, 'workspaces/ws-1/approvalCases/').length, 1);
    assert.equal(docKeys(db, 'workspaces/ws-1/actionCards/').length, 1);
    assert.equal(docKeys(db, 'workspaces/ws-1/businessEvents/').length, 1);
  });

  it('same operationId + different payload → OPERATION_MISMATCH', async () => {
    const db = createFakeDb(seedOrg());
    await createCase(db);
    await assert.rejects(
      () => createCase(db, { payload: createPayload({ title: 'Different' }) }),
      (err) => code(err) === 'OPERATION_MISMATCH',
    );
  });

  it('rejects forged server-authoritative payload fields', async () => {
    const db = createFakeDb(seedOrg());
    await assert.rejects(
      () => createCase(db, { payload: createPayload({ status: 'APPROVED' }) }),
      (err) => code(err) === 'OPERATION_INVALID',
    );
    await assert.rejects(
      () => createCase(db, { payload: createPayload({ requestedBy: { actorId: 'u-ben' } }) }),
      (err) => code(err) === 'OPERATION_INVALID',
    );
  });

  it('rejects non-member/suspended approvers — assignment is server-validated', async () => {
    const db = createFakeDb(seedOrg());
    await assert.rejects(
      () => createCase(db, { payload: createPayload({ steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u-dave'] }] }) }),
      (err) => code(err) === 'APPROVER_NOT_AUTHORIZED',
    );
    await assert.rejects(
      () => createCase(db, { payload: createPayload({ steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u-outsider'] }] }) }),
      (err) => code(err) === 'APPROVER_NOT_AUTHORIZED',
    );
  });

  it('blocks self-approval under FORBID at creation', async () => {
    const db = createFakeDb(seedOrg());
    await assert.rejects(
      () => createCase(db, { payload: createPayload({ steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u-anna'] }] }) }),
      (err) => code(err) === 'SELF_APPROVAL_DENIED',
    );
  });

  it('AGENT_PROPOSAL requestType is rejected — agents gain no authority here', async () => {
    const db = createFakeDb(seedOrg());
    await assert.rejects(
      () => createCase(db, { payload: createPayload({ requestType: 'AGENT_PROPOSAL' }) }),
      (err) => code(err) === 'OPERATION_INVALID',
    );
  });

  it('resolves a definition and pins {definitionId, version} + step snapshot', async () => {
    const db = createFakeDb({
      ...seedOrg(),
      'workspaces/ws-1/approvalDefinitions/apdef_1': {
        approvalDefinitionId: 'apdef_1', workspaceId: 'ws-1', name: 'Two-step',
        status: 'ACTIVE', version: 2,
        steps: [
          { name: 'Manager', quorum: 'ANY_ONE', approverUserIds: ['u-ben'] },
          { name: 'Finance', quorum: 'ALL', approverUserIds: ['u-carl'] },
        ],
        selfApprovalPolicy: 'FORBID',
      },
    });
    const result = await createCase(db, { payload: createPayload({ steps: undefined, definitionId: 'apdef_1' }) });
    assert.equal(result.resource.definitionRef.version, 2);
    assert.equal(result.resource.steps.length, 2);
    assert.equal(result.resource.steps[1].quorum, 'ALL');
  });

  it('a later definition edit cannot rewrite an open case (snapshot pin)', async () => {
    const db = createFakeDb({
      ...seedOrg(),
      'workspaces/ws-1/approvalDefinitions/apdef_1': {
        approvalDefinitionId: 'apdef_1', workspaceId: 'ws-1', name: 'D',
        status: 'ACTIVE', version: 1,
        steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u-ben'] }],
        selfApprovalPolicy: 'FORBID',
      },
    });
    await createCase(db, { payload: createPayload({ steps: undefined, definitionId: 'apdef_1' }) });
    // Definition upgraded to v2 — open case still shows the v1 snapshot.
    db._docs.set('workspaces/ws-1/approvalDefinitions/apdef_1', {
      ...db._docs.get('workspaces/ws-1/approvalDefinitions/apdef_1'),
      version: 2,
      steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u-carl'] }],
    });
    const c = db._docs.get('workspaces/ws-1/approvalCases/appr_op-c1');
    assert.equal(c.steps[0].assignments[0].approverUserId, 'u-ben');
    assert.equal(c.definitionRef.version, 1);
  });

  it('rejects approval on a subject that does not exist in the workspace', async () => {
    const db = createFakeDb(seedOrg());
    await assert.rejects(
      () => createCase(db, { payload: createPayload({ subject: { type: 'RECORD', id: 'rec-999' } }) }),
      (err) => code(err) === 'SUBJECT_NOT_FOUND',
    );
  });

  it('denies approval creation in a workspace the user does not belong to', async () => {
    const db = createFakeDb(seedOrg());
    await assert.rejects(
      () => createCase(db, { userId: 'u-outsider' }),
      (err) => code(err) === 'WORKSPACE_FORBIDDEN',
    );
  });
});

describe('approvalCommand — DECIDE_APPROVAL', () => {
  async function seededCase(db, { payload } = {}) {
    await createCase(db, { payload: payload || createPayload() });
  }

  it('final APPROVE resolves the case and executes the trusted action exactly once', async () => {
    const db = createFakeDb(seedOrg());
    const { actionExecutors, state } = makeExecutors();
    await seededCase(db);
    const result = await executeApprovalCommand(db, {
      userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-d1'), actionExecutors,
    });
    assert.equal(result.resource.status, 'APPROVED');
    assert.equal(state.mutations, 1);
    // exec_ op derives deterministically from the CASE creation operation —
    // any decide retry converges on the same embedded operation.
    assert.equal(state.calls[0].operationId, 'exec_op-c1');
    // Decision executed as the requester, not the approver.
    assert.equal(state.calls[0].userId, 'u-anna');
    // Decision evidence is immutable inside the case.
    const c = db._docs.get('workspaces/ws-1/approvalCases/appr_op-c1');
    assert.equal(c.decisions.length, 1);
    assert.equal(c.decisions[0].decidedBy.actorId, 'u-ben');
    assert.equal(c.decisions[0].decision, 'APPROVE');
    assert.equal(c.resolvedAt !== null, true);
    // Approver card closed.
    assert.equal(db._docs.get('workspaces/ws-1/actionCards/ac_appr_op-c1_s0_u-ben').status, 'CLOSED');
    // Events + audit.
    const events = docKeys(db, 'workspaces/ws-1/businessEvents/');
    assert.equal(events.some((k) => k.includes('approval.approved')), true);
    const audits = docKeys(db, 'workspaces/ws-1/auditEntries/');
    assert.equal(audits.some((k) => k.includes('approval.decided')), true);
    assert.equal(audits.some((k) => k.includes('approval.approved')), true);
  });

  it('decision replay is idempotent — business mutation still happens exactly once', async () => {
    const db = createFakeDb(seedOrg());
    const { actionExecutors, state } = makeExecutors();
    await seededCase(db);
    const decide = () => executeApprovalCommand(db, {
      userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-d2'), actionExecutors,
    });
    await decide();
    const replay = await decide();
    assert.equal(replay.idempotent, true);
    assert.equal(state.mutations, 1);
  });

  it('same decide operationId + different decision → OPERATION_MISMATCH', async () => {
    const db = createFakeDb(seedOrg());
    const { actionExecutors } = makeExecutors();
    await seededCase(db);
    await executeApprovalCommand(db, { userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-d3'), actionExecutors });
    await assert.rejects(
      () => executeApprovalCommand(db, { userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload({ decision: 'REJECT' }), 'op-d3'), actionExecutors }),
      (err) => code(err) === 'OPERATION_MISMATCH',
    );
  });

  it('REJECT resolves the case and never executes the action', async () => {
    const db = createFakeDb(seedOrg());
    const { actionExecutors, state } = makeExecutors();
    await seededCase(db);
    const result = await executeApprovalCommand(db, {
      userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload({ decision: 'REJECT' }), 'op-d4'), actionExecutors,
    });
    assert.equal(result.resource.status, 'REJECTED');
    assert.equal(state.mutations, 0);
    assert.equal(docKeys(db, 'workspaces/ws-1/businessEvents/').some((k) => k.includes('approval.rejected')), true);
  });

  it('denies a decision by a non-assigned user', async () => {
    const db = createFakeDb(seedOrg());
    await seededCase(db);
    await assert.rejects(
      () => executeApprovalCommand(db, { userId: 'u-carl', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-d5') }),
      (err) => code(err) === 'NOT_ASSIGNED_APPROVER',
    );
  });

  it('denies a second decision on an already-resolved case', async () => {
    const db = createFakeDb(seedOrg());
    const { actionExecutors } = makeExecutors();
    await seededCase(db);
    await executeApprovalCommand(db, { userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-d6'), actionExecutors });
    await assert.rejects(
      () => executeApprovalCommand(db, { userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-d7'), actionExecutors }),
      (err) => code(err) === 'INVALID_APPROVAL_STATE',
    );
  });

  it('denies decide on a case that does not exist in this workspace', async () => {
    const db = createFakeDb(seedOrg());
    await assert.rejects(
      () => executeApprovalCommand(db, { userId: 'u-ben', command: cmd('DECIDE_APPROVAL', { approvalCaseId: 'appr_ghost', decision: 'APPROVE' }, 'op-d8') }),
      (err) => code(err) === 'APPROVAL_NOT_FOUND',
    );
  });

  it('re-checks approver membership at decision time (temporal authority)', async () => {
    const db = createFakeDb(seedOrg());
    await seededCase(db);
    // Approver suspended between assignment and decision — membership is
    // re-evaluated at decision time, not inherited from assignment.
    db._docs.set('organizations/org-1/members/u-ben', { status: 'SUSPENDED', roles: ['MEMBER'] });
    await assert.rejects(
      () => executeApprovalCommand(db, { userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-d9') }),
      (err) => ['WORKSPACE_FORBIDDEN', 'APPROVER_NOT_AUTHORIZED'].includes(code(err)),
    );
  });

  it('marks an expired case EXPIRED at decision time — no stale execution', async () => {
    const db = createFakeDb(seedOrg());
    await seededCase(db, { payload: createPayload({ expiresAt: '2000-01-01T00:00:00.000Z' }) });
    const result = await executeApprovalCommand(db, {
      userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-d10'),
    });
    assert.equal(result.resource.status, 'EXPIRED');
    assert.equal(docKeys(db, 'workspaces/ws-1/businessEvents/').some((k) => k.includes('approval.expired')), true);
  });

  it('rejects a decision when the RECORD subject changed (stale proposal)', async () => {
    const db = createFakeDb(seedOrg());
    await seededCase(db, { payload: createPayload({ subject: { type: 'RECORD', id: 'rec-1' } }) });
    // Material mutation after approval was requested.
    db._docs.set('workspaces/ws-1/records/rec-1', {
      ...db._docs.get('workspaces/ws-1/records/rec-1'),
      updatedAt: '2026-10-16T15:00:00.000Z',
    });
    await assert.rejects(
      () => executeApprovalCommand(db, { userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-d11') }),
      (err) => code(err) === 'PROPOSAL_STALE',
    );
  });

  it('FileVersion pinning: approving v3 is invalid once v4 exists', async () => {
    const db = createFakeDb(seedOrg());
    await seededCase(db, { payload: createPayload({ subject: { type: 'FILE', id: 'f_1' } }) });
    const c = db._docs.get('workspaces/ws-1/approvalCases/appr_op-c1');
    assert.equal(c.subject.revision, 'v3');
    // v4 published after the approval was requested → stale.
    db._docs.set('workspaces/ws-1/files/f_1', { ...db._docs.get('workspaces/ws-1/files/f_1'), currentVersion: 4 });
    await assert.rejects(
      () => executeApprovalCommand(db, { userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-d12') }),
      (err) => code(err) === 'PROPOSAL_STALE',
    );
  });

  it('FileVersion pinning: unchanged version allows the decision', async () => {
    const db = createFakeDb(seedOrg());
    const { actionExecutors } = makeExecutors();
    await seededCase(db, { payload: createPayload({ subject: { type: 'FILE', id: 'f_1' } }) });
    const result = await executeApprovalCommand(db, {
      userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-d13'), actionExecutors,
    });
    assert.equal(result.resource.status, 'APPROVED');
  });

  it('multi-step: first step advances, last step executes', async () => {
    const db = createFakeDb(seedOrg());
    const { actionExecutors, state } = makeExecutors();
    await createCase(db, {
      payload: createPayload({
        steps: [
          { quorum: 'ANY_ONE', approverUserIds: ['u-ben'] },
          { quorum: 'ALL', approverUserIds: ['u-carl'] },
        ],
      }),
    });
    const step1 = await executeApprovalCommand(db, {
      userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-m1'), actionExecutors,
    });
    assert.equal(step1.resource.status, 'PENDING');
    assert.equal(step1.resource.currentStepIndex, 1);
    assert.equal(state.mutations, 0); // no execution until final step
    // Step-2 card opened for u-carl; u-ben's card closed.
    assert.equal(db._docs.get('workspaces/ws-1/actionCards/ac_appr_op-c1_s1_u-carl').status, 'OPEN');
    assert.equal(db._docs.get('workspaces/ws-1/actionCards/ac_appr_op-c1_s0_u-ben').status, 'CLOSED');

    const step2 = await executeApprovalCommand(db, {
      userId: 'u-carl', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-m2'), actionExecutors,
    });
    assert.equal(step2.resource.status, 'APPROVED');
    assert.equal(state.mutations, 1);
  });

  it('ALL quorum keeps the step PENDING until every assignee approves', async () => {
    const db = createFakeDb(seedOrg());
    const { actionExecutors, state } = makeExecutors();
    await createCase(db, {
      payload: createPayload({ steps: [{ quorum: 'ALL', approverUserIds: ['u-ben', 'u-carl'] }] }),
    });
    const first = await executeApprovalCommand(db, {
      userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-a1'), actionExecutors,
    });
    assert.equal(first.resource.status, 'PENDING');
    assert.equal(state.mutations, 0);
    const second = await executeApprovalCommand(db, {
      userId: 'u-carl', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-a2'), actionExecutors,
    });
    assert.equal(second.resource.status, 'APPROVED');
    assert.equal(state.mutations, 1);
  });

  it('embedded command execution uses the deterministic exec_ operationId', async () => {
    const db = createFakeDb(seedOrg());
    const { actionExecutors, state } = makeExecutors();
    await seededCase(db);
    await executeApprovalCommand(db, {
      userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-e1'), actionExecutors,
    });
    assert.equal(state.calls[0].operationId, 'exec_op-c1');
    assert.equal(state.calls[0].userId, 'u-anna'); // requester authority, not approver
  });
});

describe('approvalCommand — CANCEL_APPROVAL', () => {
  it('requester cancels a pending case; cards close; evidence preserved', async () => {
    const db = createFakeDb(seedOrg());
    await createCase(db);
    const result = await executeApprovalCommand(db, {
      userId: 'u-anna', command: cmd('CANCEL_APPROVAL', { approvalCaseId: 'appr_op-c1', reason: 'withdrawn' }, 'op-x1'),
    });
    assert.equal(result.resource.status, 'CANCELLED');
    assert.equal(db._docs.get('workspaces/ws-1/actionCards/ac_appr_op-c1_s0_u-ben').status, 'CLOSED');
    assert.equal(docKeys(db, 'workspaces/ws-1/businessEvents/').some((k) => k.includes('approval.cancelled')), true);
  });

  it('a cancelled case cannot be decided', async () => {
    const db = createFakeDb(seedOrg());
    await createCase(db);
    await executeApprovalCommand(db, { userId: 'u-anna', command: cmd('CANCEL_APPROVAL', { approvalCaseId: 'appr_op-c1' }, 'op-x2') });
    await assert.rejects(
      () => executeApprovalCommand(db, { userId: 'u-ben', command: cmd('DECIDE_APPROVAL', decidePayload(), 'op-x3') }),
      (err) => code(err) === 'INVALID_APPROVAL_STATE',
    );
  });

  it('non-requester members cannot cancel', async () => {
    const db = createFakeDb(seedOrg());
    await createCase(db);
    await assert.rejects(
      () => executeApprovalCommand(db, { userId: 'u-carl', command: cmd('CANCEL_APPROVAL', { approvalCaseId: 'appr_op-c1' }, 'op-x4') }),
      (err) => code(err) === 'CANCELLATION_FORBIDDEN',
    );
  });
});

describe('approvalCommand — definitions', () => {
  it('creates + updates a definition with deterministic version bump', async () => {
    const db = createFakeDb(seedOrg());
    const created = await executeApprovalCommand(db, {
      userId: 'u-anna',
      command: cmd('CREATE_APPROVAL_DEFINITION', {
        name: 'Standard', steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u-ben'] }],
      }, 'op-def1'),
    });
    assert.equal(created.resource.approvalDefinitionId, 'apdef_op-def1');
    assert.equal(created.resource.version, 1);

    const updated = await executeApprovalCommand(db, {
      userId: 'u-anna',
      command: cmd('UPDATE_APPROVAL_DEFINITION', {
        approvalDefinitionId: 'apdef_op-def1',
        steps: [{ quorum: 'ALL', approverUserIds: ['u-ben', 'u-carl'] }],
      }, 'op-def2'),
    });
    assert.equal(updated.resource.version, 2);
  });
});

describe('approvalCommand — isolation & unauthenticated', () => {
  it('unauthenticated requests fail', async () => {
    const db = createFakeDb(seedOrg());
    await assert.rejects(
      () => executeApprovalCommand(db, { userId: null, command: cmd('CREATE_APPROVAL', createPayload()) }),
      (err) => code(err) === 'UNAUTHENTICATED',
    );
  });

  it('cross-workspace decide cannot reach another workspace\'s case', async () => {
    const db = createFakeDb({
      ...seedOrg(),
      'workspaces/ws-2/approvalCases/appr_foreign': {
        approvalCaseId: 'appr_foreign', workspaceId: 'ws-2', status: 'PENDING',
        requestedBy: { actorType: 'USER', actorId: 'u-anna' },
        steps: [{ stepIndex: 0, quorum: 'ANY_ONE', status: 'PENDING', assignments: [{ approverUserId: 'u-ben', status: 'PENDING', decisionId: null }] }],
        decisions: [], currentStepIndex: 0,
      },
    });
    // u-ben is not an org-2 member — and the case isn't under ws-1 anyway.
    await assert.rejects(
      () => executeApprovalCommand(db, { userId: 'u-ben', command: cmd('DECIDE_APPROVAL', { approvalCaseId: 'appr_foreign', decision: 'APPROVE' }, 'op-i1') }),
      (err) => ['WORKSPACE_FORBIDDEN', 'APPROVAL_NOT_FOUND'].includes(code(err)),
    );
  });
});

describe('approvalCommand — end-to-end trusted action proof (§39)', () => {
  // The REAL trusted path, wired exactly as functions/index.js wires it:
  //   ApprovalCase → APPROVED → RECORD_COMMAND re-enters recordCommand
  //   under a deterministic exec_ operationId.
  function e2eSeed() {
    return {
      ...seedOrg(),
      'workspaces/ws-1/records/rec-e2e': {
        recordId: 'rec-e2e', workspaceId: 'ws-1', status: 'SUBMITTED',
        moduleId: null, recordType: 'NOTE', data: {},
        createdBy: { actorType: 'USER', actorId: 'u-anna' },
        submittedBy: { actorType: 'USER', actorId: 'u-anna' },
      },
    };
  }
  const e2eAction = {
    actionType: 'RECORD_COMMAND',
    command: { commandType: 'ARCHIVE_RECORD', payload: { recordId: 'rec-e2e' } },
  };
  const e2eExecutors = (db) => ({
    RECORD_COMMAND: ({ userId, command }) => executeRecordCommand(db, { userId, command }),
  });

  it('pending approval leaves the protected mutation unexecuted; final approve executes it exactly once', async () => {
    const db = createFakeDb(e2eSeed());
    const actionExecutors = e2eExecutors(db);

    // 1. REQUEST → case created; the embedded trusted action has NOT run.
    await executeApprovalCommand(db, {
      userId: 'u-anna',
      command: cmd('CREATE_APPROVAL', createPayload({ proposedAction: e2eAction, subject: { type: 'RECORD', id: 'rec-e2e' } }), 'op-e2e'),
      actionExecutors,
    });
    assert.equal(db._docs.get('workspaces/ws-1/records/rec-e2e').status, 'SUBMITTED');
    assert.equal(db._docs.has('workspaces/ws-1/actionCards/ac_appr_op-e2e_s0_u-ben'), true);

    // 2. DECISION → authorized approver → real trusted mutation runs.
    const decided = await executeApprovalCommand(db, {
      userId: 'u-ben',
      command: cmd('DECIDE_APPROVAL', { approvalCaseId: 'appr_op-e2e', decision: 'APPROVE' }, 'op-e2e-dec'),
      actionExecutors,
    });
    assert.equal(decided.resource.status, 'APPROVED');
    assert.equal(decided.execution.executed, true);
    assert.equal(db._docs.get('workspaces/ws-1/records/rec-e2e').status, 'ARCHIVED');
    // The embedded operation journal is under the same workspace collection.
    assert.equal(db._docs.get('workspaces/ws-1/recordOperations/exec_op-e2e').status, 'COMPLETED');

    // 3. REPLAY the decide — no duplicate mutation, journal converges.
    const replay = await executeApprovalCommand(db, {
      userId: 'u-ben',
      command: cmd('DECIDE_APPROVAL', { approvalCaseId: 'appr_op-e2e', decision: 'APPROVE' }, 'op-e2e-dec'),
      actionExecutors,
    });
    assert.equal(replay.idempotent, true);
    assert.equal(db._docs.get('workspaces/ws-1/records/rec-e2e').status, 'ARCHIVED');
    // Exactly one exec_ journal entry and one archive effect.
    assert.equal(docKeys(db, 'workspaces/ws-1/recordOperations/').filter((k) => k.includes('exec_')).length, 1);
  });

  it('REJECT never reaches the trusted action', async () => {
    const db = createFakeDb(e2eSeed());
    const actionExecutors = e2eExecutors(db);
    await executeApprovalCommand(db, {
      userId: 'u-anna',
      command: cmd('CREATE_APPROVAL', createPayload({ proposedAction: e2eAction }), 'op-e2e2'),
      actionExecutors,
    });
    await executeApprovalCommand(db, {
      userId: 'u-ben',
      command: cmd('DECIDE_APPROVAL', { approvalCaseId: 'appr_op-e2e2', decision: 'REJECT' }, 'op-e2e2-dec'),
      actionExecutors,
    });
    assert.equal(db._docs.get('workspaces/ws-1/records/rec-e2e').status, 'SUBMITTED');
  });
});
