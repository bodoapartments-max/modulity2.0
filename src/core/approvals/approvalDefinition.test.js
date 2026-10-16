/**
 * ApprovalDefinition model unit tests (Step 31)
 */
import { describe, it, expect } from 'vitest';
import { createApprovalDefinition, validateDefinitionSteps, APPROVAL_DEFINITION_STATUSES } from './approvalDefinition.js';
import { buildDefinitionUpdatePatch } from './approvalCommandEngine.js';
import { APPROVAL_QUORUM_POLICIES, SELF_APPROVAL_POLICIES, APPROVAL_LIMITS } from './approvalConstraints.js';

const NOW = '2026-10-16T12:00:00.000Z';

function baseDefinition(overrides = {}) {
  return createApprovalDefinition({
    approvalDefinitionId: 'apdef_1',
    workspaceId: 'ws1',
    name: 'Standard approval',
    steps: [
      { name: 'Manager', quorum: APPROVAL_QUORUM_POLICIES.ANY_ONE, approverUserIds: ['u_mgr'] },
      { name: 'Finance', quorum: APPROVAL_QUORUM_POLICIES.ALL, approverUserIds: ['u_fin1', 'u_fin2'] },
    ],
    createdBy: { actorType: 'USER', actorId: 'u1' },
    now: NOW,
    ...overrides,
  });
}

describe('createApprovalDefinition', () => {
  it('builds version 1 ACTIVE definition', () => {
    const d = baseDefinition();
    expect(d.version).toBe(1);
    expect(d.status).toBe(APPROVAL_DEFINITION_STATUSES.ACTIVE);
    expect(d.steps).toHaveLength(2);
    expect(d.selfApprovalPolicy).toBe(SELF_APPROVAL_POLICIES.FORBID);
  });

  it('rejects more than MAX_STEPS steps', () => {
    const steps = Array.from({ length: APPROVAL_LIMITS.MAX_STEPS + 1 }, (_, i) => ({ quorum: 'ANY_ONE', approverUserIds: [`u${i}`] }));
    expect(() => baseDefinition({ steps })).toThrow(/steps/);
  });

  it('rejects duplicate approvers within a step', () => {
    expect(() => baseDefinition({ steps: [{ quorum: 'ALL', approverUserIds: ['u1', 'u1'] }] })).toThrow(/duplicate/);
  });

  it('rejects unknown quorum policies', () => {
    expect(() => baseDefinition({ steps: [{ quorum: 'QUORUM_3', approverUserIds: ['u1'] }] })).toThrow(/quorum/);
  });

  it('rejects unknown self-approval policies', () => {
    expect(() => baseDefinition({ selfApprovalPolicy: 'SOMETIMES' })).toThrow(/selfApprovalPolicy/);
  });
});

describe('validateDefinitionSteps', () => {
  it('normalizes steps and freezes them', () => {
    const steps = validateDefinitionSteps([{ quorum: 'ANY_ONE', approverUserIds: ['a'] }]);
    expect(Object.isFrozen(steps[0])).toBe(true);
    expect(steps[0].name).toBeNull();
  });
});

describe('buildDefinitionUpdatePatch (versioning)', () => {
  const def = baseDefinition();
  const cmd = (payload) => ({ payload });

  it('structural step change bumps version', () => {
    const patch = buildDefinitionUpdatePatch({
      command: cmd({ steps: [{ quorum: 'ALL', approverUserIds: ['x'] }] }),
      definition: def,
      now: '2026-10-17T00:00:00.000Z',
    });
    expect(patch.version).toBe(2);
    expect(patch.steps[0].approverUserIds).toEqual(['x']);
  });

  it('cosmetic name change keeps version', () => {
    const patch = buildDefinitionUpdatePatch({
      command: cmd({ name: 'Renamed' }),
      definition: def,
      now: '2026-10-17T00:00:00.000Z',
    });
    expect(patch.name).toBe('Renamed');
    expect(patch.version).toBeUndefined();
  });

  it('identical steps do not bump version', () => {
    const patch = buildDefinitionUpdatePatch({
      command: cmd({ steps: def.steps.map((s) => ({ name: s.name, quorum: s.quorum, approverUserIds: [...s.approverUserIds] })) }),
      definition: def,
      now: '2026-10-17T00:00:00.000Z',
    });
    expect(patch.version).toBeUndefined();
  });

  it('selfApprovalPolicy change is structural', () => {
    const patch = buildDefinitionUpdatePatch({
      command: cmd({ selfApprovalPolicy: SELF_APPROVAL_POLICIES.ALLOW }),
      definition: def,
      now: '2026-10-17T00:00:00.000Z',
    });
    expect(patch.version).toBe(2);
  });
});
