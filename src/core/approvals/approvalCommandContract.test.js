/**
 * Approval command contract validation tests (Step 31)
 */
import { describe, it, expect } from 'vitest';
import {
  validateApprovalCommand,
  buildCreateApprovalCommand,
  buildDecideApprovalCommand,
  buildCancelApprovalCommand,
  APPROVAL_COMMAND_TYPES,
  APPROVAL_COMMAND_ERROR_CODES,
} from './approvalCommandContract.js';
import { PROPOSED_ACTION_TYPES, APPROVAL_REQUEST_TYPES } from './approvalConstraints.js';

const recordAction = {
  actionType: PROPOSED_ACTION_TYPES.RECORD_COMMAND,
  command: { commandType: 'SUBMIT_RECORD', payload: { recordId: 'r1' } },
};

function createCmd(payloadOverrides = {}) {
  return buildCreateApprovalCommand({
    operationId: 'op1',
    workspaceId: 'ws1',
    requestType: APPROVAL_REQUEST_TYPES.TRUSTED_COMMAND,
    title: 'Please approve',
    proposedAction: recordAction,
    steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u2'] }],
    ...payloadOverrides,
  });
}

describe('envelope validation', () => {
  it('accepts a valid CREATE_APPROVAL command', () => {
    expect(validateApprovalCommand(createCmd()).valid).toBe(true);
  });

  it('rejects non-object commands', () => {
    const r = validateApprovalCommand('x');
    expect(r.valid).toBe(false);
    expect(r.code).toBe(APPROVAL_COMMAND_ERROR_CODES.OPERATION_INVALID);
  });

  it('rejects unsupported contractVersion', () => {
    const c = createCmd();
    c.contractVersion = '9.9.9';
    expect(validateApprovalCommand(c).code).toBe(APPROVAL_COMMAND_ERROR_CODES.UNSUPPORTED_CONTRACT_VERSION);
  });

  it('rejects unknown commandType', () => {
    const c = createCmd();
    c.commandType = 'EXECUTE_ANYTHING';
    expect(validateApprovalCommand(c).code).toBe(APPROVAL_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND);
  });
});

describe('server-authoritative fields (forgery attempts)', () => {
  it.each([
    'requestedBy', 'decidedBy', 'decidedAt', 'status', 'currentStepIndex',
    'decisions', 'assignments', 'proposalFingerprint', 'execution',
    'resolvedAt', 'approvalCaseId', 'createdAt', 'updatedAt', 'actor', 'userId',
  ])('rejects client-supplied payload.%s on CREATE', (key) => {
    const c = createCmd();
    c.payload[key] = 'forged';
    const r = validateApprovalCommand(c);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(new RegExp(key));
  });

  it('rejects client-supplied operationId inside the proposed action', () => {
    const c = createCmd();
    c.payload.proposedAction.command.operationId = 'evil';
    expect(validateApprovalCommand(c).valid).toBe(false);
  });

  it('rejects workspaceId inside the proposed action command payload context', () => {
    const c = createCmd();
    c.payload.proposedAction.workspaceId = 'other-ws';
    expect(validateApprovalCommand(c).valid).toBe(false);
  });
});

describe('proposed action — closed registry', () => {
  it('rejects non-registry actionTypes', () => {
    const c = buildCreateApprovalCommand({
      operationId: 'op1', workspaceId: 'ws1', requestType: 'TRUSTED_COMMAND',
      title: 't', proposedAction: { actionType: 'eval', command: {} },
      steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u2'] }],
    });
    expect(validateApprovalCommand(c).valid).toBe(false);
  });

  it('rejects non-record commandTypes inside RECORD_COMMAND', () => {
    const c = createCmd();
    c.payload.proposedAction.command.commandType = 'DROP_TABLE';
    expect(validateApprovalCommand(c).valid).toBe(false);
  });

  it('rejects missing embedded command payload', () => {
    const c = createCmd();
    delete c.payload.proposedAction.command.payload;
    expect(validateApprovalCommand(c).valid).toBe(false);
  });
});

describe('CREATE_APPROVAL payload rules', () => {
  it('requires either definitionId or inline steps — not both, not neither', () => {
    const both = createCmd();
    both.payload.definitionId = 'apdef_1';
    expect(validateApprovalCommand(both).valid).toBe(false);
    const neither = buildCreateApprovalCommand({
      operationId: 'op1', workspaceId: 'ws1', requestType: 'TRUSTED_COMMAND',
      title: 't', proposedAction: recordAction,
    });
    expect(validateApprovalCommand(neither).valid).toBe(false);
  });

  it('rejects inactive requestTypes (AGENT_PROPOSAL is reserved)', () => {
    const c = buildCreateApprovalCommand({
      operationId: 'op1', workspaceId: 'ws1', requestType: 'AGENT_PROPOSAL',
      title: 't', proposedAction: recordAction, steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u2'] }],
    });
    expect(validateApprovalCommand(c).valid).toBe(false);
  });

  it('rejects NONE subject type and missing subject.id', () => {
    const c = createCmd();
    c.payload.subject = { type: 'NONE' };
    expect(validateApprovalCommand(c).valid).toBe(false);
    c.payload.subject = { type: 'RECORD' };
    expect(validateApprovalCommand(c).valid).toBe(false);
  });

  it('rejects malformed expiresAt', () => {
    const c = createCmd();
    c.payload.expiresAt = 'tomorrow';
    expect(validateApprovalCommand(c).valid).toBe(false);
  });
});

describe('DECIDE / CANCEL payloads', () => {
  it('DECIDE requires a valid approvalCaseId and closed decision', () => {
    expect(validateApprovalCommand(buildDecideApprovalCommand({
      operationId: 'op2', workspaceId: 'ws1', approvalCaseId: 'appr_x', decision: 'APPROVE',
    })).valid).toBe(true);
    expect(validateApprovalCommand(buildDecideApprovalCommand({
      operationId: 'op2', workspaceId: 'ws1', approvalCaseId: 'bad id', decision: 'APPROVE',
    })).valid).toBe(false);
    expect(validateApprovalCommand(buildDecideApprovalCommand({
      operationId: 'op2', workspaceId: 'ws1', approvalCaseId: 'appr_x', decision: 'REQUEST_CHANGES',
    })).valid).toBe(false);
  });

  it('DECIDE allows approvalCaseId but still blocks other server fields', () => {
    const c = buildDecideApprovalCommand({ operationId: 'op2', workspaceId: 'ws1', approvalCaseId: 'appr_x', decision: 'APPROVE' });
    c.payload.decidedBy = { actorId: 'forged' };
    expect(validateApprovalCommand(c).valid).toBe(false);
  });

  it('CANCEL requires a valid approvalCaseId', () => {
    expect(validateApprovalCommand(buildCancelApprovalCommand({
      operationId: 'op3', workspaceId: 'ws1', approvalCaseId: 'appr_x',
    })).valid).toBe(true);
    expect(validateApprovalCommand(buildCancelApprovalCommand({
      operationId: 'op3', workspaceId: 'ws1', approvalCaseId: 'nope',
    })).valid).toBe(false);
  });
});

describe('definition payloads', () => {
  const defCmd = (commandType, payload) => ({ contractVersion: '1.0.0', commandType, operationId: 'op', payload: { workspaceId: 'ws1', ...payload } });

  it('CREATE definition requires name + steps', () => {
    expect(validateApprovalCommand(defCmd(APPROVAL_COMMAND_TYPES.CREATE_APPROVAL_DEFINITION, {
      name: 'd', steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u2'] }],
    })).valid).toBe(true);
    expect(validateApprovalCommand(defCmd(APPROVAL_COMMAND_TYPES.CREATE_APPROVAL_DEFINITION, { name: 'd' })).valid).toBe(false);
  });

  it('UPDATE definition requires approvalDefinitionId', () => {
    expect(validateApprovalCommand(defCmd(APPROVAL_COMMAND_TYPES.UPDATE_APPROVAL_DEFINITION, { name: 'x' })).valid).toBe(false);
    expect(validateApprovalCommand(defCmd(APPROVAL_COMMAND_TYPES.UPDATE_APPROVAL_DEFINITION, { approvalDefinitionId: 'apdef_1', name: 'x' })).valid).toBe(true);
  });
});
