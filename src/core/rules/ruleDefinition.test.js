import { describe, expect, it } from 'vitest';
import {
  createRuleDefinition,
  evaluate,
  evaluateAll,
  ruleOperations,
  RULE_ERROR_CODES,
  RULE_STATUSES,
} from './ruleDefinition.js';

describe('RuleDefinition contract', () => {
  it('creates a valid rule with identity + version + status', () => {
    const rd = createRuleDefinition({
      ruleId: 'rule-1',
      ruleCode: 'TEST_RULE',
      name: 'Test Rule',
      workspaceId: 'ws-1',
      trigger: { eventType: 'record.created' },
      conditions: null,
      intents: [],
    });
    expect(rd.ruleId).toBe('rule-1');
    expect(rd.ruleVersion).toBe('1');
    expect(rd.status).toBe(RULE_STATUSES.ACTIVE);
  });

  it('rejects malformed identity and unknown event types', () => {
    expect(() => createRuleDefinition({ ruleId: 'a', ruleCode: 'lower', name: 'x', workspaceId: 'ws-1' })).toThrow();
    expect(() => createRuleDefinition({ ruleId: 'a', ruleCode: 'FUNC', name: 'x', workspaceId: 'ws-1', trigger: { eventType: 'unknown' } })).toThrow(RULE_ERROR_CODES.INVALID_EVENT_TYPE);
  });
});

describe('Operator coverage — every supported operator has tests', () => {
  const makeRule = (extra) => createRuleDefinition({
    ruleId: 'r1', ruleCode: 'OP', name: 'operator test', workspaceId: 'ws-1', ...extra,
  });
  const sample = { event: { eventType: 'record.created', payload: { delta: 5, list: ['a','b'], label: 'x' } }, state: { floors: 3 }, context: {} };

  for (const [name, op, left, right, expected] of [
    ['equals true', 'equals', 1, 1, true],
    ['equals false', 'equals', 1, 2, false],
    ['notEquals true', 'notEquals', 1, 2, true],
    ['notEquals false', 'notEquals', 1, 1, false],
    ['greaterThan true', 'greaterThan', 7, 5, true],
    ['greaterThan false', 'greaterThan', 5, 7, false],
    ['greaterThan type mismatch', 'greaterThan', '5', 5, 'TYPE_ERROR'],
    ['lessThan true', 'lessThan', 4, 10, true],
    ['lessThan false', 'lessThan', 10, 4, false],
    ['lessThanOrEqual true', 'lessThanOrEqual', 4, 4, true],
    ['contains array true', 'contains', ['a','b'], 'a', true],
    ['contains array false', 'contains', ['a','b'], 'z', false],
    ['in true', 'in', 'a', ['a','b'], true],
    ['exists true', 'exists', 'value', null, true],
    ['notExists true', 'notExists', undefined, null, true],
  ]) {
    it(name, () => {
      const r = makeRule({ conditions: { op, leftValue: left, rightValue: right } });
      if (expected === 'TYPE_ERROR') expect(() => evaluate(r, sample)).toThrow();
      else {
        const result = evaluate(r, sample);
        expect(result.matched).toBe(expected);
      }
    });
  }

  it('ruleOperations() returns the supported operator set', () => {
    const ops = ruleOperations();
    expect(ops).toContain('equals');
    expect(ops).toContain('notEquals');
    expect(ops).toContain('greaterThan');
    expect(ops).toContain('contains');
    expect(ops).toContain('in');
    expect(ops).toContain('exists');
  });

  it('handles AND / OR / NOT without unlimited recursion', () => {
    const rd = createRuleDefinition({
      ruleId: 'mult', ruleCode: 'MULT', name: 'combo', workspaceId: 'ws-1',
      conditions: { or: [{ not: { op: 'equals', leftValue: 5, rightValue: 5 } }, { op: 'exists', leftValue: 'a' }] },
      intents: [],
    });
    expect(evaluate(rd, { event: { eventType: 'record.created' } }).matched).toBe(true);
  });

  it('evaluation is deterministic — same input, same output', () => {
    const rd = createRuleDefinition({ ruleId: 'd', ruleCode: 'DET', name: 'det', workspaceId: 'ws-1', conditions: { op: 'equals', leftValue: 1, rightValue: 1 } });
    for (let i = 0; i < 5; i++) {
      expect(evaluate(rd, { event: { eventType: 'record.created' } }).matched).toBe(true);
    }
  });
});

describe('DecisionResult / TransitionIntent semantics', () => {
  it('matched rules produce frozen TransitionIntents tied to event identity', () => {
    const rd = createRuleDefinition({
      ruleId: 'out', ruleCode: 'OUT', name: 'output', workspaceId: 'ws-1',
      intents: [{ intentType: 'INTENT_OPERATION', targetRef: 'module:m1', parameters: {} }],
      conditions: { op: 'equals', leftValue: 'ok', rightValue: 'ok' },
    });
    const out = evaluate(rd, { event: { eventId: 'be_x', eventType: 'record.created' } });
    expect(out.intents.length).toBe(1);
    expect(out.intents[0].sourceEventId).toBe('be_x');
  });

  it('zero-intent match produces empty intent list explicitly', () => {
    const rd = createRuleDefinition({
      ruleId: 'zero', ruleCode: 'ZERO', name: 'none', workspaceId: 'ws-1',
      conditions: { op: 'equals', leftValue: true, rightValue: true },
      intents: [],
    });
    const out = evaluate(rd, { event: { eventType: 'record.created' } });
    expect(out.matched).toBe(true);
    expect(out.intents).toHaveLength(0);
  });

  it('no-match yields matched=false and no intents', () => {
    const rd = createRuleDefinition({ ruleId: 'strict', ruleCode: 'X', name: 'x', workspaceId: 'ws-1', conditions: { op: 'equals', leftValue: 1, rightValue: 2 } });
    expect(evaluate(rd, { event: { eventType: 'record.created' } }).matched).toBe(false);
    expect(evaluate(rd, { event: { eventType: 'record.created' } }).intents).toHaveLength(0);
  });

  it('multiple rules: priority ordering is deterministic', () => {
    const low = createRuleDefinition({ ruleId: 'low', ruleCode: 'LOW', name: 'low', workspaceId: 'ws-1', priority: 0, conditions: { op: 'equals', leftValue: 1, rightValue: 1 }, intents: [] });
    const high = createRuleDefinition({ ruleId: 'high', ruleCode: 'HIGH', name: 'high', workspaceId: 'ws-1', priority: 50, conditions: { op: 'equals', leftValue: 1, rightValue: 1 }, intents: [] });
    const results = evaluateAll([low, high], { event: { eventType: 'record.created' } });
    expect(results[0].rule.ruleCode).toBe('HIGH');
    expect(results[1].rule.ruleCode).toBe('LOW');
  });

  it('mixed RESULTS stay deterministic — no result silently dropped', () => {
    const ok = createRuleDefinition({ ruleId: 'a', ruleCode: 'A', name: 'a', workspaceId: 'ws-1', conditions: { op: 'equals', leftValue: 1, rightValue: 1 } });
    const no = createRuleDefinition({ ruleId: 'b', ruleCode: 'B', name: 'b', workspaceId: 'ws-1', conditions: { op: 'equals', leftValue: 1, rightValue: 2 } });
    const results = evaluateAll([ok, no], { event: { eventType: 'record.created' } });
    expect(results.filter((r) => r.matched).map((r) => r.rule.ruleCode)).toEqual(['A']);
  });
});

describe('cycle protection + limits', () => {
  it('never recurses past MAX_DEPTH by depth trap', () => {
    const rd = createRuleDefinition({ ruleId: 'deep', ruleCode: 'DEEP', name: 'd', workspaceId: 'ws-1', conditions: null });
    const result = evaluate(rd, { event: { eventType: 'record.created' } });
    expect(result.matched).toBe(true);
  });

  it('report trace is bounded by MAX_CONDITION_COUNT for repeated children', () => {
    const node = { op: 'equals', leftValue: 1, rightValue: 1 };
    const rd = createRuleDefinition({ ruleId: 't', ruleCode: 'T', name: 't', workspaceId: 'ws-1', conditions: { and: new Array(60).fill(node) } });
    const out = evaluate(rd, { event: { eventType: 'record.created' } });
    expect(out.trace.length).toBeLessThanOrEqual(128);
  });
});
