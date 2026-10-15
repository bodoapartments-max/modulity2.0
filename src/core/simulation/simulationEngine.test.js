import { describe, expect, it } from 'vitest';
import {
  createStateOverlay,
  evaluateSimulatedTransition,
  simulateScenario,
} from './simulationEngine.js';
import { createAuthorityGrant } from '../permissions/policyAuthority.js';

function matchingRule() {
  return {
    ruleId: 'r-vm',
    ruleCode: 'VM_EVENT',
    name: 'Vehicle Maintenance detection',
    workspaceId: 'ws-1',
    status: 'ACTIVE',
    trigger: { eventType: 'record.created' },
    conditions: { op: 'equals', leftValue: 'PASS', rightValue: 'PASS' },
    intents: [{ intentType: 'RULE_VM_EVENT', targetRef: 'module:vehicleMaintenance', parameters: {} }],
    priority: 0,
  };
}

function authorityGrant(override = {}) {
  return createAuthorityGrant({
    grantId: 'auth-pedagogy',
    workspaceId: 'ws-1',
    granteeActorId: 'user-x',
    grantedByActorId: 'user-o',
    authority: ['policy.manage'],
    resources: ['VEHICLE_INSPECTION', 'RECORD'],
    validFrom: '2026-10-01T00:00:00Z',
    validUntil: '2026-10-15T00:00:00Z',
    ...override,
  });
}

describe('state overlay — base unchanged', () => {
  it('overlay shares structural refs but never mutates base', () => {
    const base = { reservation: { room: 12 }, status: 'READY' };
    const overlay = createStateOverlay(base, [{ path: 'reservation.room', value: 22 }]);
    expect(base.reservation.room).toBe(12);
    expect(overlay.entries).toHaveLength(1);
    expect(overlay.__isOverlay).toBe(true);
  });
});

describe('evaluateSimulatedTransition orchestrates rules+policy without touching production', () => {
  const event = {
    eventId: 'be_step18',
    eventType: 'record.created',
    payload: { amount: 7, resourceType: 'RECORD' },
    objectReference: { type: 'RECORD', id: 'rec-1', workspaceId: 'ws-1' },
  };
  const state = { vault: { storage: 42 } };
  const context = { evaluationTime: '2026-10-04T12:00:00Z' };

  it('evaluates a rule that matches and emits an intent — no production side effects', () => {
    const result = evaluateSimulatedTransition(
      { rule: matchingRule(), event, state, context, actor: { actorType: 'USER', actorId: 'user-x' }, authority: [authorityGrant()] },
      'ws-1',
    );
    expect(result.ruleOutcome.matched).toBe(true);
    expect(result.intents).toHaveLength(1);
    expect(result.policy).toBe('AUTO_EXECUTE');
    expect(result.projectedEvents[0].__projectedEvent).toBe(true);
    // The base state stays untouched — no assumption-boundary leak.
    expect(state.vault.storage).toBe(42);
  });
});

describe('simulateScenario is deterministic, bounded and leak-proof', () => {
  const event = {
    eventId: 'be_step18',
    eventType: 'record.created',
    payload: { amount: 1, resourceType: 'RECORD' },
    objectReference: { type: 'RECORD', id: 'rec-1', workspaceId: 'ws-1' },
  };
  const step = { ruleCode: 'DSA_RULE', rule: matchingRule() };
  it('rejects cycles via lineage checks', () => {
    const two = [step, step];
    expect(() => simulateScenario({ runId: 'sim-1', workspaceId: 'ws-1', inputEvent: event, state: {}, steps: two })).toThrow('SIMULATION_CYCLE_DETECTED');
  });
  it('limits evaluation to MAX_STEPS', () => {
    const steps = Array.from({ length: 40 }, (_, i) => ({ ruleCode: `RULE_${i + 1}`, rule: matchingRule() }));
    expect(() => simulateScenario({ runId: 'sim-2', workspaceId: 'ws-1', inputEvent: event, state: {}, steps })).toThrow('SIMULATION_LIMIT_EXCEEDED');
  });
  it('returns a deterministic result with trace and matched intents', () => {
    const outcome = simulateScenario({ runId: 'sim-3', workspaceId: 'ws-1', inputEvent: event, state: {}, actor: { actorType: 'USER', actorId: 'user-x' }, authority: [authorityGrant()], steps: [step] });
    expect(outcome.decisions[0].inputs).toBe(undefined);
    expect(outcome.projectedEvents).toHaveLength(1);
    expect(outcome.cycleDetected).toBe(false);
  });
  it('empty steps return zero worthy trace', () => {
    const outcome = simulateScenario({ runId: 'sim-4', workspaceId: 'ws-1', inputEvent: event, state: {}, steps: [] });
    expect(outcome.decisions).toHaveLength(0);
  });

  it('state ledger is immutable against mutation from projection stage', () => {
    const shared = { base: { deepCounter: 10 } };
    const overlay = createStateOverlay(shared, []);
    expect(shared.base.deepCounter).toBe(10);
    createStateOverlay(shared, [{ path: 'base.deepCounter', value: 22 }]);
    expect(shared.base.deepCounter).toBe(10);
    void overlay;
  });
});
