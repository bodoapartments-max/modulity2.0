/**
 * RC-01 integration proofs for the canonical Gateway operations.
 *
 * The fake command executor models the SAME observable contract as the
 * server-side operation journal in functions/src/recordCommandEngine.js:
 *   - same operationId + same fingerprint → idempotent replay, ONE effect
 *   - same operationId + different fingerprint → OPERATION_MISMATCH
 *   - one canonical BusinessEvent per logical operation (event id is derived
 *     from operationId — retries converge onto the same event document)
 */
import { describe, expect, it } from 'vitest';
import { GatewayEngine } from './gatewayEngine.js';
import { GATEWAY_ERROR_CODES } from './gatewayGateway.js';
import { createCanonicalGatewayOperations } from './gatewayCanonicalOperations.js';
import { CapabilityRegistry } from '../../capabilities/capabilityRegistry.js';
import { createBuiltInCapabilityRegistry } from '../../capabilities/registry/builtInCapabilityCatalog.js';
import {
  createAuthorityGrant,
  POLICY_OUTCOMES,
} from '../permissions/policyAuthority.js';
import { businessEventIdFor, BUSINESS_EVENT_TYPES } from '../events/businessEvent.js';

const WS_A = 'ws-a';
const WS_B = 'ws-b';
const USER_A = { actorType: 'USER', actorId: 'user-a' };

function capabilityRegistry() {
  return new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();
}

/** In-memory model of the trusted journal contract (NOT a second engine). */
function createFakeTrustedCommand() {
  const journal = new Map();
  const records = new Map();
  const events = new Map();
  let executeCalls = 0;
  return {
    journal, records, events,
    get executeCalls() { return executeCalls; },
    async execute(command) {
      executeCalls += 1;
      const key = `${command.payload.workspaceId}:${command.operationId}`;
      const fingerprint = JSON.stringify(command);
      const existing = journal.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          const err = new Error('Operation command mismatch.');
          err.code = 'OPERATION_MISMATCH';
          throw err;
        }
        return { record: records.get(existing.recordId), operationId: command.operationId, idempotent: true };
      }
      const recordId = `rec_${records.size + 1}`;
      const record = {
        recordId,
        workspaceId: command.payload.workspaceId,
        moduleId: command.payload.moduleId,
        data: { ...command.payload.values },
        status: command.payload.isDraft ? 'DRAFT' : 'SUBMITTED',
      };
      journal.set(key, { fingerprint, recordId });
      records.set(recordId, record);
      // BusinessEvent identity is derived from operationId — a retry of the
      // same logical operation witnesses the SAME event document.
      const eventId = businessEventIdFor(command.operationId, BUSINESS_EVENT_TYPES.RECORD_CREATED);
      events.set(eventId, { eventId, eventType: BUSINESS_EVENT_TYPES.RECORD_CREATED, workspaceId: command.payload.workspaceId, idempotencyKey: command.operationId });
      return { record, operationId: command.operationId, idempotent: false };
    },
  };
}

function makeEngine({ recordService = null, recordQueryService = null, recordCommand, policyDecider } = {}) {
  const operations = createCanonicalGatewayOperations({
    recordService: recordService || { getRecord: async () => null },
    recordQueryService,
    recordCommand: recordCommand || createFakeTrustedCommand(),
    policyDecider,
  });
  return new GatewayEngine({ operations, capabilityRegistry: capabilityRegistry() });
}

function grantFor(workspaceId, actorId, authority = ['record.read', 'record.create']) {
  return createAuthorityGrant({
    grantId: `g-${actorId}`,
    workspaceId,
    granteeActorId: actorId,
    grantedByActorId: 'user-owner',
    authority,
    resources: ['RECORD'],
  });
}

function req(overrides = {}) {
  return {
    apiVersion: 'v1',
    operationId: `op-${Math.random().toString(36).slice(2, 10)}`,
    operation: 'record.create',
    workspaceId: WS_A,
    input: { moduleId: 'mod-1', values: { note: 'hello' } },
    ...overrides,
  };
}

const ctx = (overrides = {}) => ({
  workspaceId: WS_A,
  actor: USER_A,
  grants: [grantFor(WS_A, USER_A.actorId)],
  ...overrides,
});

describe('canonical READ — record.get', () => {
  it('reads a Record through the canonical read service in the caller workspace', async () => {
    const record = { recordId: 'rec-1', workspaceId: WS_A, data: {} };
    const recordService = { getRecord: async (workspaceId, recordId) => (workspaceId === WS_A && recordId === 'rec-1' ? record : null) };
    const engine = makeEngine({ recordService });
    const res = await engine.handle(req({ operation: 'record.get', input: { recordId: 'rec-1' } }), ctx());
    expect(res.success).toBe(true);
    expect(res.data.record.recordId).toBe('rec-1');
  });

  it('denies cross-workspace reads — ws-a caller cannot read ws-b data', async () => {
    const record = { recordId: 'rec-b', workspaceId: WS_B, data: {} };
    const recordService = { getRecord: async (workspaceId, recordId) => (workspaceId === record.workspaceId && recordId === record.recordId ? record : null) };
    const engine = makeEngine({ recordService });
    // Explicit mismatched workspace claim:
    const mismatched = await engine.handle(
      req({ operation: 'record.get', workspaceId: WS_B, input: { recordId: 'rec-b' } }),
      ctx(),
    );
    expect(mismatched.success).toBe(false);
    expect(mismatched.error.code).toBe(GATEWAY_ERROR_CODES.WORKSPACE_MISMATCH);
    // Even with a ws-b-scoped grant, the trusted context stays ws-a and the
    // canonical read service cannot resolve ws-b state from it:
    const viaContext = await engine.handle(
      req({ operation: 'record.get', input: { recordId: 'rec-b' } }),
      ctx({ grants: [grantFor(WS_A, USER_A.actorId), grantFor(WS_B, USER_A.actorId)] }),
    );
    expect(viaContext.success).toBe(false);
  });

  it('requires an authenticated actor context', async () => {
    const engine = makeEngine();
    const res = await engine.handle(req({ operation: 'record.get', input: { recordId: 'rec-1' } }), { workspaceId: WS_A });
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.AUTHENTICATION_REQUIRED);
  });
});

describe('canonical MUTATION — record.create', () => {
  it('AUTO_EXECUTE → the trusted command executes and returns a normalized response', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({ recordCommand: trusted });
    const res = await engine.handle(req({ idempotencyKey: 'idem-1' }), ctx());
    expect(res.success).toBe(true);
    expect(res.data.operationId).toBe('idem-1');
    expect(res.data.recordId).toBe('rec_1');
    expect(trusted.records.size).toBe(1);
  });

  it('reuses the trusted command journal: idempotencyKey becomes command.operationId', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({ recordCommand: trusted });
    await engine.handle(req({ idempotencyKey: 'idem-map' }), ctx());
    expect(trusted.journal.has(`${WS_A}:idem-map`)).toBe(true);
  });

  it('APPROVAL_REQUIRED → no canonical mutation', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({
      recordCommand: trusted,
      policyDecider: () => ({ outcome: POLICY_OUTCOMES.APPROVAL_REQUIRED }),
    });
    const res = await engine.handle(req({ idempotencyKey: 'idem-approval' }), ctx());
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.APPROVAL_REQUIRED);
    expect(trusted.executeCalls).toBe(0);
    expect(trusted.records.size).toBe(0);
  });

  it('DENY → no canonical mutation', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({
      recordCommand: trusted,
      policyDecider: () => ({ outcome: POLICY_OUTCOMES.DENY }),
    });
    const res = await engine.handle(req({ idempotencyKey: 'idem-deny' }), ctx());
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.POLICY_DENIED);
    expect(trusted.executeCalls).toBe(0);
  });

  it('no applicable authority grant → denied, no mutation', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({ recordCommand: trusted });
    const res = await engine.handle(req({ idempotencyKey: 'idem-nogrant' }), ctx({ grants: [] }));
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.POLICY_DENIED);
    expect(trusted.executeCalls).toBe(0);
  });

  it('cross-workspace mutation is rejected before any trusted command runs', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({ recordCommand: trusted });
    const res = await engine.handle(req({ workspaceId: WS_B, idempotencyKey: 'idem-ws' }), ctx());
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.WORKSPACE_MISMATCH);
    expect(trusted.executeCalls).toBe(0);
  });
});

describe('idempotency boundary (trusted journal semantics)', () => {
  it('same idempotency identity + same payload twice → ONE canonical effect', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({ recordCommand: trusted });
    const first = await engine.handle(req({ operationId: 'op-dup', idempotencyKey: 'dup-1' }), ctx());
    const second = await engine.handle(req({ operationId: 'op-dup', idempotencyKey: 'dup-1' }), ctx());
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.data.idempotent).toBe(true);
    expect(second.data.recordId).toBe(first.data.recordId);
    expect(trusted.records.size).toBe(1);
  });

  it('same idempotency identity + different payload → stable conflict, no second mutation', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({ recordCommand: trusted });
    await engine.handle(req({ idempotencyKey: 'conf-1', input: { moduleId: 'mod-1', values: { a: 1 } } }), ctx());
    const conflict = await engine.handle(req({ idempotencyKey: 'conf-1', input: { moduleId: 'mod-1', values: { a: 2 } } }), ctx());
    expect(conflict.success).toBe(false);
    expect(conflict.error.code).toBe(GATEWAY_ERROR_CODES.CONFLICTING_IDEMPOTENCY);
    expect(trusted.records.size).toBe(1);
  });

  it('exactly one canonical BusinessEvent is witnessed per logical operation', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({ recordCommand: trusted });
    await engine.handle(req({ operationId: 'op-ev', idempotencyKey: 'ev-1' }), ctx());
    await engine.handle(req({ operationId: 'op-ev', idempotencyKey: 'ev-1' }), ctx());
    const created = [...trusted.events.values()].filter((e) => e.eventType === BUSINESS_EVENT_TYPES.RECORD_CREATED);
    expect(created).toHaveLength(1);
    expect(created[0].eventId).toBe(businessEventIdFor('ev-1', BUSINESS_EVENT_TYPES.RECORD_CREATED));
  });
});

describe('protected fields and response hygiene', () => {
  it.each(['workspaceId', 'createdBy', 'createdAt', 'status', 'actor', 'userId'])(
    'rejects external injection of server-authoritative field %s',
    async (field) => {
      const trusted = createFakeTrustedCommand();
      const engine = makeEngine({ recordCommand: trusted });
      const res = await engine.handle(
        req({ idempotencyKey: `prot-${field}`, input: { moduleId: 'mod-1', values: { x: 1 }, [field]: 'injected' } }),
        ctx(),
      );
      expect(res.success).toBe(false);
      expect(res.error.code).toBe(GATEWAY_ERROR_CODES.VALIDATION_FAILED);
      expect(trusted.executeCalls).toBe(0);
    },
  );

  it('error responses are normalized — no stack, no secret material, no details payload', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({ recordCommand: trusted });
    const res = await engine.handle(req({ idempotencyKey: 'sec-1' }), ctx({ grants: [] }));
    expect(res.success).toBe(false);
    expect(res.error.details).toBeNull();
    expect(JSON.stringify(res)).not.toContain('stack');
    expect(JSON.stringify(res)).not.toContain('apiKey');
  });

  it('credential material in context never leaks into the response', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({ recordCommand: trusted });
    const res = await engine.handle(
      req({ operation: 'record.get', input: { recordId: 'rec-1' } }),
      ctx({ credential: { secret: 'shhh-vault-material' } }),
    );
    expect(JSON.stringify(res)).not.toContain('shhh-vault-material');
  });
});

describe('closed registry contract', () => {
  it('unregistered operations never reach a handler', async () => {
    const trusted = createFakeTrustedCommand();
    const engine = makeEngine({ recordCommand: trusted });
    const res = await engine.handle(req({ operation: 'sys.exec', input: {} }), ctx());
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.UNKNOWN_OPERATION);
  });
});

// ─── Step 30: canonical File operations ──────────────────────────────

function fileGrantFor(workspaceId, actorId, authority = ['file.read', 'file.write']) {
  return createAuthorityGrant({
    grantId: `gf-${actorId}`,
    workspaceId,
    granteeActorId: actorId,
    grantedByActorId: 'user-owner',
    authority,
    resources: ['FILE'],
  });
}

function fakeFileDeps() {
  const commands = [];
  return {
    commands,
    fileService: {
      getFile: async (workspaceId, fileId) =>
        (workspaceId === WS_A && fileId === 'f_1'
          ? { fileId: 'f_1', workspaceId: WS_A, name: 'a.pdf', status: 'ACTIVE' }
          : (() => { throw new Error('not found'); })()),
    },
    fileCommand: {
      async execute(command) {
        commands.push(command);
        return { resource: { attachmentId: 'att_1', fileId: command.payload.fileId }, operationId: command.operationId, idempotent: false };
      },
    },
  };
}

function makeFileEngine({ fileService, fileCommand, policyDecider } = {}) {
  const operations = createCanonicalGatewayOperations({
    recordService: { getRecord: async () => null },
    recordCommand: createFakeTrustedCommand(),
    fileService,
    fileCommand,
    policyDecider,
  });
  return new GatewayEngine({ operations, capabilityRegistry: capabilityRegistry() });
}

const fileCtx = () => ctx({ grants: [fileGrantFor(WS_A, USER_A.actorId)] });

describe('canonical READ — file.get', () => {
  it('reads File metadata through the canonical service in the caller workspace', async () => {
    const { fileService, fileCommand } = fakeFileDeps();
    const engine = makeFileEngine({ fileService, fileCommand });
    const res = await engine.handle(req({ operation: 'file.get', input: { fileId: 'f_1' } }), fileCtx());
    expect(res.success).toBe(true);
    expect(res.data.file.fileId).toBe('f_1');
  });

  it('denies files that do not resolve in the caller workspace', async () => {
    const { fileService, fileCommand } = fakeFileDeps();
    const engine = makeFileEngine({ fileService, fileCommand });
    const res = await engine.handle(req({ operation: 'file.get', input: { fileId: 'f_other' } }), fileCtx());
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.VALIDATION_FAILED);
  });

  it('fails closed when the file capability is not configured', async () => {
    const engine = makeFileEngine({});
    const res = await engine.handle(req({ operation: 'file.get', input: { fileId: 'f_1' } }), fileCtx());
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.CAPABILITY_UNAVAILABLE);
  });
});

describe('canonical MUTATION — file.attach / file.detach', () => {
  it('file.attach routes through the trusted fileCommand boundary', async () => {
    const { fileService, fileCommand, commands } = fakeFileDeps();
    const engine = makeFileEngine({ fileService, fileCommand });
    const res = await engine.handle(
      req({ operation: 'file.attach', idempotencyKey: 'fa-1', input: { fileId: 'f_1', targetType: 'RECORD', targetId: 'rec-1' } }),
      fileCtx(),
    );
    expect(res.success).toBe(true);
    expect(commands.length).toBe(1);
    expect(commands[0].commandType).toBe('ATTACH_FILE');
    expect(commands[0].operationId).toBe('fa-1');
    expect(commands[0].payload).toMatchObject({ fileId: 'f_1', targetType: 'RECORD', targetId: 'rec-1' });
  });

  it('file.detach routes through the trusted fileCommand boundary', async () => {
    const { fileService, fileCommand, commands } = fakeFileDeps();
    const engine = makeFileEngine({ fileService, fileCommand });
    const res = await engine.handle(
      req({ operation: 'file.detach', idempotencyKey: 'fd-1', input: { attachmentId: 'att_1' } }),
      fileCtx(),
    );
    expect(res.success).toBe(true);
    expect(commands[0].commandType).toBe('DETACH_FILE');
  });

  it('policy denial stops the trusted command from executing', async () => {
    const { fileService, fileCommand, commands } = fakeFileDeps();
    const denied = makeFileEngine({ fileService, fileCommand, policyDecider: () => ({ outcome: POLICY_OUTCOMES.DENY }) });
    const res = await denied.handle(
      req({ operation: 'file.attach', idempotencyKey: 'fa-deny', input: { fileId: 'f_1', targetType: 'RECORD', targetId: 'r' } }),
      fileCtx(),
    );
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.POLICY_DENIED);
    expect(commands.length).toBe(0);
  });

  it('rejects protected-field injection into file commands', async () => {
    const { fileService, fileCommand, commands } = fakeFileDeps();
    const engine = makeFileEngine({ fileService, fileCommand });
    const res = await engine.handle(
      req({ operation: 'file.attach', idempotencyKey: 'fa-prot', input: { fileId: 'f_1', targetType: 'RECORD', targetId: 'r', workspaceId: 'injected' } }),
      fileCtx(),
    );
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.VALIDATION_FAILED);
    expect(commands.length).toBe(0);
  });
});

// ─── Step 31: canonical Approval operations ──────────────────────────

function approvalGrantFor(workspaceId, actorId, authority = ['approval.read', 'approval.write']) {
  return createAuthorityGrant({
    grantId: `ga-${actorId}`,
    workspaceId,
    granteeActorId: actorId,
    grantedByActorId: 'user-owner',
    authority,
    resources: ['APPROVAL_CASE'],
  });
}

function fakeApprovalDeps() {
  const commands = [];
  return {
    commands,
    approvalService: {
      getApprovalCase: async (workspaceId, approvalCaseId) =>
        (workspaceId === WS_A && approvalCaseId === 'appr_1'
          ? { approvalCaseId: 'appr_1', workspaceId: WS_A, status: 'PENDING' }
          : (() => { throw new Error('not found'); })()),
      listApprovalCasesForRequester: async (workspaceId, requesterUserId) =>
        (workspaceId === WS_A ? [{ approvalCaseId: 'appr_1', workspaceId: WS_A, requestedBy: { actorId: requesterUserId } }] : []),
    },
    approvalCommand: {
      async execute(command) {
        commands.push(command);
        return { resource: { approvalCaseId: command.payload.approvalCaseId, status: 'APPROVED' }, operationId: command.operationId, idempotent: false };
      },
    },
  };
}

function makeApprovalEngine({ approvalService, approvalCommand, policyDecider } = {}) {
  const operations = createCanonicalGatewayOperations({
    recordService: { getRecord: async () => null },
    recordCommand: createFakeTrustedCommand(),
    approvalService,
    approvalCommand,
    policyDecider,
  });
  return new GatewayEngine({ operations, capabilityRegistry: capabilityRegistry() });
}

const approvalCtx = () => ctx({ grants: [approvalGrantFor(WS_A, USER_A.actorId)] });

describe('canonical READ — approval.get / approval.list', () => {
  it('reads an ApprovalCase in the caller workspace', async () => {
    const { approvalService, approvalCommand } = fakeApprovalDeps();
    const engine = makeApprovalEngine({ approvalService, approvalCommand });
    const res = await engine.handle(req({ operation: 'approval.get', input: { approvalCaseId: 'appr_1' } }), approvalCtx());
    expect(res.success).toBe(true);
    expect(res.data.approvalCase.approvalCaseId).toBe('appr_1');
  });

  it('denies a case that does not resolve in the caller workspace', async () => {
    const { approvalService, approvalCommand } = fakeApprovalDeps();
    const engine = makeApprovalEngine({ approvalService, approvalCommand });
    const res = await engine.handle(req({ operation: 'approval.get', input: { approvalCaseId: 'appr_other' } }), approvalCtx());
    expect(res.success).toBe(false);
  });

  it('lists cases for the caller requester only', async () => {
    const { approvalService, approvalCommand } = fakeApprovalDeps();
    const engine = makeApprovalEngine({ approvalService, approvalCommand });
    const res = await engine.handle(req({ operation: 'approval.list', input: {} }), approvalCtx());
    expect(res.success).toBe(true);
    expect(res.data.approvalCases[0].requestedBy.actorId).toBe(USER_A.actorId);
  });

  it('fails closed when the approval capability is not configured', async () => {
    const engine = makeApprovalEngine({});
    const res = await engine.handle(req({ operation: 'approval.get', input: { approvalCaseId: 'appr_1' } }), approvalCtx());
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.CAPABILITY_UNAVAILABLE);
  });
});

describe('canonical MUTATION — approval.create', () => {
  const proposedAction = { actionType: 'RECORD_COMMAND', command: { commandType: 'SUBMIT_RECORD', payload: { recordId: 'r1' } } };

  it('routes case creation through the trusted boundary with server-pinned workspace', async () => {
    const { approvalService, approvalCommand, commands } = fakeApprovalDeps();
    const engine = makeApprovalEngine({ approvalService, approvalCommand });
    const res = await engine.handle(
      req({
        operation: 'approval.create', idempotencyKey: 'acr-1',
        input: { requestType: 'TRUSTED_COMMAND', title: 'Review', proposedAction, steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u2'] }] },
      }),
      approvalCtx(),
    );
    expect(res.success).toBe(true);
    expect(commands[0].commandType).toBe('CREATE_APPROVAL');
    expect(commands[0].operationId).toBe('acr-1');
    expect(commands[0].payload.workspaceId).toBe(WS_A);
  });

  it('no arbitrary approval mutation exists — unregistered ops are rejected', async () => {
    const { approvalService, approvalCommand } = fakeApprovalDeps();
    const engine = makeApprovalEngine({ approvalService, approvalCommand });
    const res = await engine.handle(req({ operation: 'approval.forceApprove', input: {} }), approvalCtx());
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.UNKNOWN_OPERATION);
  });
});

describe('canonical MUTATION — approval.decide / approval.cancel', () => {
  it('approval.decide routes through the trusted approvalCommand boundary', async () => {
    const { approvalService, approvalCommand, commands } = fakeApprovalDeps();
    const engine = makeApprovalEngine({ approvalService, approvalCommand });
    const res = await engine.handle(
      req({ operation: 'approval.decide', idempotencyKey: 'ad-1', input: { approvalCaseId: 'appr_1', decision: 'APPROVE' } }),
      approvalCtx(),
    );
    expect(res.success).toBe(true);
    expect(commands.length).toBe(1);
    expect(commands[0].commandType).toBe('DECIDE_APPROVAL');
    expect(commands[0].operationId).toBe('ad-1');
    expect(commands[0].payload).toMatchObject({ approvalCaseId: 'appr_1', decision: 'APPROVE', workspaceId: WS_A });
  });

  it('approval.cancel routes through the trusted boundary', async () => {
    const { approvalService, approvalCommand, commands } = fakeApprovalDeps();
    const engine = makeApprovalEngine({ approvalService, approvalCommand });
    const res = await engine.handle(
      req({ operation: 'approval.cancel', idempotencyKey: 'ac-1', input: { approvalCaseId: 'appr_1', reason: 'withdrawn' } }),
      approvalCtx(),
    );
    expect(res.success).toBe(true);
    expect(commands[0].commandType).toBe('CANCEL_APPROVAL');
  });

  it('policy denial stops the trusted approval command', async () => {
    const { approvalService, approvalCommand, commands } = fakeApprovalDeps();
    const denied = makeApprovalEngine({ approvalService, approvalCommand, policyDecider: () => ({ outcome: POLICY_OUTCOMES.DENY }) });
    const res = await denied.handle(
      req({ operation: 'approval.decide', idempotencyKey: 'ad-deny', input: { approvalCaseId: 'appr_1', decision: 'APPROVE' } }),
      approvalCtx(),
    );
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.POLICY_DENIED);
    expect(commands.length).toBe(0);
  });

  it('rejects protected-field injection into approval commands', async () => {
    const { approvalService, approvalCommand, commands } = fakeApprovalDeps();
    const engine = makeApprovalEngine({ approvalService, approvalCommand });
    const res = await engine.handle(
      req({ operation: 'approval.decide', idempotencyKey: 'ad-prot', input: { approvalCaseId: 'appr_1', decision: 'APPROVE', workspaceId: 'injected' } }),
      approvalCtx(),
    );
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.VALIDATION_FAILED);
    expect(commands.length).toBe(0);
  });

  it('cross-workspace decide is rejected before the trusted command runs', async () => {
    const { approvalService, approvalCommand, commands } = fakeApprovalDeps();
    const engine = makeApprovalEngine({ approvalService, approvalCommand });
    const res = await engine.handle(
      req({ operation: 'approval.decide', workspaceId: WS_B, idempotencyKey: 'ad-ws', input: { approvalCaseId: 'appr_1', decision: 'APPROVE' } }),
      approvalCtx(),
    );
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.WORKSPACE_MISMATCH);
    expect(commands.length).toBe(0);
  });
});
