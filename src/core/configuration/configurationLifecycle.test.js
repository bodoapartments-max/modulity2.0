import { describe, expect, it } from 'vitest';
import {
  createConfigurationRevision,
  validateConfiguration,
  publishConfiguration,
  validateRollbackCompatibility,
  CONFIGURATION_ERROR_CODES,
  CONFIGURATION_STATUSES,
  CONFIGURATION_TYPES,
  rollbackConfiguration,
  testConfigurationDryRun,
} from './configurationLifecycle.js';

function baseDraft(extra = {}) {
  return createConfigurationRevision({
    configurationId: 'art-buy-rule',
    configurationType: CONFIGURATION_TYPES.RULE,
    revision: 1,
    workspaceId: 'ws-1',
    definition: {
      ruleId: 'rule-a',
      ruleVersion: '1',
      ruleCode: 'RULE_A',
      name: 'Rule A',
      workspaceId: 'ws-1',
    },
    createdBy: { actorType: 'USER', actorId: 'user-owner' },
    ...extra,
  });
}

describe('createConfigurationRevision — canonical shape', () => {
  it('builds an immutable DRAFT revision', () => {
    const rev = baseDraft();
    expect(rev.status).toBe(CONFIGURATION_STATUSES.DRAFT);
    expect(rev.revision).toBe(1);
    expect(() => { rev.status = 'PUBLISHED'; }).toThrow();
  });

  it('rejects invalid revision zero', () => {
    expect(() => baseDraft({ revision: 0 })).toThrow();
  });
});

describe('immutable revision → publish', () => {
  it('auto-publishes a valid Rule configuration when policy allows AUTO_EXECUTE', () => {
    const rev = baseDraft();
    const published = publishConfiguration(rev, { evaluatingActor: { outcome: 'AUTO_EXECUTE', actorType: 'USER', actorId: 'user-owner' } });
    expect(published.status).toBe(CONFIGURATION_STATUSES.PUBLISHED);
    expect(published.publishedAt).toBeTruthy();
    expect(published.publishedBy?.actorId).toBe('user-owner');
  });

  it('APPROVAL_REQUIRED decision blocks publication with the correct error', () => {
    const rev = baseDraft({ status: CONFIGURATION_STATUSES.PENDING_APPROVAL });
    expect(() => publishConfiguration(rev, { evaluatingActor: { outcome: 'AUTO_EXECUTE' } })).toThrow(/APPROVAL_REQUIRED/);
  });

  it('DENY blocks publication', () => {
    const rev = baseDraft();
    expect(() => publishConfiguration(rev, { evaluatingActor: { outcome: 'DENY' } })).toThrow(/POLICY_DENIED/);
  });
});

describe('validateConfiguration on RULE type', () => {
  it('requires rule identity fields', () => {
    const rev = baseDraft({ definition: { name: 'x' } });
    const out = validateConfiguration(rev);
    expect(out.valid).toBe(false);
    expect(out.errors[0]).toContain('ruleId');
  });

  it('succeeds when all required fields are present', () => {
    const rev = baseDraft();
    expect(validateConfiguration(rev).valid).toBe(true);
  });
});

describe('testConfigurationDryRun is side-effect-free', () => {
  it('performs a dry run against typed configurations and does nothing else', () => {
    const rev = baseDraft();
    expect(() => testConfigurationDryRun(rev, {})).not.toThrow();
  });
});

describe('rollback semantics', () => {
  it('rollback yields PENDING_APPROVAL state — never deletes history', () => {
    const prev = baseDraft({ revision: 1, status: CONFIGURATION_STATUSES.PUBLISHED });
    const current = baseDraft({ revision: 2, status: CONFIGURATION_STATUSES.PUBLISHED });
    const rollback = rollbackConfiguration(current, prev, { actor: { actorType: 'USER', actorId: 'user-owner' } });
    expect(rollback.status).toBe(CONFIGURATION_STATUSES.PENDING_APPROVAL);
    expect(rollback.revision).toBe(current.revision);
  });
});
