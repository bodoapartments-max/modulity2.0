import { describe, expect, it } from 'vitest';
import {
  createAuthorityGrant,
  decideAuthorization,
  evaluatePolicy,
  grantApplies,
  POLICY_ERROR_CODES,
  POLICY_OUTCOMES,
} from './policyAuthority.js';

function makeGrant(overrides = {}) {
  return createAuthorityGrant({
    grantId: 'g1',
    workspaceId: 'ws-1',
    granteeActorId: 'user-x',
    grantedByActorId: 'user-owner',
    authority: ['policy.manage'],
    resources: ['RECORD', 'MODULE'],
    ...overrides,
  });
}

describe('createAuthorityGrant', () => {
  it('builds an immutable authority grant', () => {
    const g = makeGrant();
    expect(g.grantId).toBe('g1');
    expect(g.authority).toContain('policy.manage');
    expect(g.resources).toContain('RECORD');
    expect(() => { g.authority = []; }).toThrow();
  });

  it('rejects missing fields and reversed windows', () => {
    expect(() => createAuthorityGrant({})).toThrow();
    expect(() => createAuthorityGrant({
      grantId: 'g1', workspaceId: 'ws-1', granteeActorId: 'u1', grantedByActorId: 'u-owner',
      authority: ['policy.manage'], resources: ['RECORD'],
      validFrom: '2026-10-08T00:00:00Z', validUntil: '2026-10-01T00:00:00Z',
    })).toThrow(/validFrom.*validUntil|INVALID_POLICY_DEFINITION/);
  });
});

describe('temporal grant validity', () => {
  const start = new Date('2026-10-01T00:00:00Z');
  const end = new Date('2026-10-08T00:00:00Z');
  const grant = makeGrant({ validFrom: start.toISOString(), validUntil: end.toISOString() });

  it.each([
    ['before window', new Date('2026-09-30T23:59:59Z'), false],
    ['at the start boundary', start, true],
    ['mid-window', new Date('2026-10-05T12:00:00Z'), true],
    ['at the end boundary (exclusive)', end, false],
    ['after window', new Date('2026-12-01T12:00:00Z'), false],
  ])('%s', (_, when, expected) => {
    expect(grantApplies(grant, { actorActorId: 'user-x', workspaceId: 'ws-1', resourceId: 'rec-1', resourceType: 'RECORD', evaluationTime: when })).toBe(expected);
  });
});

describe('decideAuthorization', () => {
  it('no authority ⇒ fail-safe NO_AUTHORITY', () => {
    const decision = decideAuthorization({
      actor: { actorType: 'USER', actorId: 'u-no-active-grant' },
      grantSnapshot: [],
      workspaceId: 'ws-1',
      permission: 'policy.manage',
    });
    expect(decision.statusCode).toBe(POLICY_ERROR_CODES.NO_AUTHORITY);
    expect(decision.outcome).toBeNull();
  });

  it('authority+permission within valid time window = AUTO_EXECUTE', () => {
    const decision = decideAuthorization({
      actor: { actorType: 'USER', actorId: 'user-x' },
      grantSnapshot: [makeGrant()],
      workspaceId: 'ws-1',
      resourceType: 'RECORD',
      resourceId: 'rec-42',
      permission: 'policy.manage',
      evaluationTime: new Date('2026-10-02T12:00:00Z'),
    });
    expect(decision.outcome).toBe(POLICY_OUTCOMES.AUTO_EXECUTE);
    expect(decision.authoritativeGrantId).toBe('g1');
  });

  it('revoked grant = GRANT_REVOKED', () => {
    const decision = decideAuthorization({
      actor: { actorType: 'USER', actorId: 'user-x' },
      grantSnapshot: [makeGrant({ status: 'REVOKED' })],
      workspaceId: 'ws-1',
      resourceType: 'RECORD',
      resourceId: 'rec-42',
      permission: 'policy.manage',
      evaluationTime: new Date('2026-10-02T12:00:00Z'),
    });
    expect(decision.statusCode).toBe(POLICY_ERROR_CODES.NO_AUTHORITY); // grants skipped; nothing else backs anyway
  });

  it('wrong workspace = NO_AUTHORITY even with valid grant elsewhere', () => {
    const decision = decideAuthorization({
      actor: { actorType: 'USER', actorId: 'user-x' },
      grantSnapshot: [makeGrant()],
      workspaceId: 'ws-2',
      resourceType: 'RECORD',
      resourceId: 'rec-x',
      permission: 'policy.manage',
      evaluationTime: new Date('2026-10-02T12:00:00Z'),
    });
    expect(decision.statusCode).toBe(POLICY_ERROR_CODES.NO_AUTHORITY);
  });
});

describe('no execution from evaluation', () => {
  it('the evaluator returns metadata, never translates bets into authoritative actions', () => {
    const decision = decideAuthorization({
      actor: { actorType: 'USER', actorId: 'user-x' },
      grantSnapshot: [makeGrant()],
      workspaceId: 'ws-1',
      resourceType: 'RECORD',
      resourceId: 'rec-42',
      permission: 'policy.manage',
      evaluationTime: new Date('2026-10-02T12:00:00Z'),
    });
    expect(decision.executed).toBeUndefined();
    expect(decision.approved).toBeUndefined();
  });
});
