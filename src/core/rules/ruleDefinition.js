/**
 * Modulity 2.0 — Rules / Decision Engine contract (Step 23)
 *
 * Canonical Rule Definition. The engine evaluates declarative rules against a
 * canonical BusinessEvent plus a bounded state snapshot, returning a
 * DecisionResult and TransitionIntents. It never executes anything — intents
 * are forwarded to the trusted platform boundary.
 *
 * RULE ≠ COMMAND ≠ DECISION ≠ EXECUTION.
 * RULE ≠ POLICY: Rule decides; Policy later grants/denies execution.
 *
 * No conditions that read Firestore, call network, use Date.now(), random,
 * or reach outside canonical data.
 *
 * @module core/rules/ruleDefinition
 */
import { generateId } from '../utils/generateId.js';
import { BUSINESS_EVENT_TYPES } from '../events/businessEvent.js';

export const RULE_CONTRACT_VERSION = '1.0.0';

export const RULE_STATUSES = Object.freeze({ ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' });

export const RULE_LIMITS = Object.freeze({
  MAX_DEPTH: 6,
  MAX_CONDITION_COUNT: 64,
  MAX_INTENTS_PER_RULE: 16,
  MAX_RULES_PER_EVALUATION: 128,
  MAX_PATH_DEPTH: 8,
  MAX_TRACE_ENTRIES: 128,
  MAX_PAYLOAD_KEYS: 32,
});

export const RULE_ERROR_CODES = Object.freeze({
  UNKNOWN_RULE: 'UNKNOWN_RULE',
  UNKNOWN_RULE_VERSION: 'UNKNOWN_RULE_VERSION',
  INVALID_RULE_DEFINITION: 'INVALID_RULE_DEFINITION',
  UNKNOWN_OPERATOR: 'UNKNOWN_OPERATOR',
  INVALID_VALUE_REFERENCE: 'INVALID_VALUE_REFERENCE',
  TYPE_MISMATCH: 'TYPE_MISMATCH',
  EVALUATION_LIMIT_EXCEEDED: 'EVALUATION_LIMIT_EXCEEDED',
  RULE_CYCLE_DETECTED: 'RULE_CYCLE_DETECTED',
  INVALID_INTENT: 'INVALID_INTENT',
  INVALID_EVENT_TYPE: 'INVALID_EVENT_TYPE',
});

/** Machine-readable comparisons. Unknown operators must fail loudly. */
const OPERATOR_DEFINITIONS = Object.freeze({
  equals: { arity: 2, apply: (left, right) => left === right },
  notEquals: { arity: 2, apply: (left, right) => left !== right },
  greaterThan: {
    arity: 2,
    apply: (left, right) => {
      if (typeof left !== 'number' || typeof right !== 'number') throw new TypeError('greaterThan requires numeric operands');
      return left > right;
    },
  },
  greaterThanOrEqual: {
    arity: 2,
    apply: (left, right) => {
      if (typeof left !== 'number' || typeof right !== 'number') throw new TypeError('greaterThanOrEqual requires numeric operands');
      return left >= right;
    },
  },
  lessThan: {
    arity: 2,
    apply: (left, right) => {
      if (typeof left !== 'number' || typeof right !== 'number') throw new TypeError('lessThan requires numeric operands');
      return left < right;
    },
  },
  lessThanOrEqual: {
    arity: 2,
    apply: (left, right) => {
      if (typeof left !== 'number' || typeof right !== 'number') throw new TypeError('lessThanOrEqual requires numeric operands');
      return left <= right;
    },
  },
  contains: {
    arity: 2,
    apply: (left, right) => {
      if (Array.isArray(left)) return left.includes(right);
      if (typeof left === 'string') return left.includes(String(right));
      throw new TypeError('contains requires array or string');
    },
  },
  in: {
    arity: 2,
    apply: (left, right) => {
      if (!Array.isArray(right)) throw new TypeError("in operator's right operand must be an array");
      return right.includes(left);
    },
  },
  exists: {
    arity: 1,
    apply: (value, _unused) => value !== null && value !== undefined,
  },
  notExists: {
    arity: 1,
    apply: (value, _unused) => value === null || value === undefined,
  },
});

/**
 * Canonical object path reference into the scoped evaluation context:
 * { source: 'EVENT'|'STATE'|'CONTEXT'|'PAYLOAD'|'OBJECT', path: ['a','b','c'] }
 *
 * Events path semantics: from the canonical BusinessEvent envelope.
 */
const VALUE_REF_SOURCES = Object.freeze(['EVENT', 'STATE', 'CONTEXT', 'OBJECT']);

/**
 * Rule Definition shape:

   ruleId        — stable machine identity (rule_<rand>
   ruleVersion   — e.g. '1' string
   ruleCode      — uppercase machine code (unique per workspace scope)
   name          — human label
   description
   workspaceId
   status        — ACTIVE | INACTIVE
   trigger       — { eventType?: string, objectReference?: { type, id? , workspaceId? } }
   conditions    — root node AND/OR/NOT or operator node { op, leftRef, rightValue | rightRef }
   intents       — [{ intentType, targetRef, parameters, description }]
   priority      — optional numeric priority; 0 default

 * Note: status changes don't permit public writes — management lives in the
 * trusted boundary layer (Step 25/Policy Engine).
 */
function assertOperator(op) {
  if (!OPERATOR_DEFINITIONS[op]) throw new Error(`${RULE_ERROR_CODES.UNKNOWN_OPERATOR}: ${op}`);
}

function validateConditions(node, depth = 0, count = { value: 0 }) {
  if (!node) return count.value;
  if (depth > RULE_LIMITS.MAX_DEPTH) throw new Error(RULE_ERROR_CODES.EVALUATION_LIMIT_EXCEEDED);
  if ('and' in node || 'or' in node || 'not' in node) {
    const parts = Array.isArray(node.and) ? node.and : Array.isArray(node.or) ? node.or : [node.not].filter(Boolean);
    for (const child of parts) validateConditions(child, depth + 1, count);
    return count.value; // only leaves count toward MAX_CONDITION_COUNT
  }
  count.value += 1;
  if (count.value > RULE_LIMITS.MAX_CONDITION_COUNT) throw new Error(RULE_ERROR_CODES.EVALUATION_LIMIT_EXCEEDED);
  assertOperator(node.op);
  if (node.leftRef) {
    const { source, path } = node.leftRef;
    if (!VALUE_REF_SOURCES.includes(source)) throw new Error(`${RULE_ERROR_CODES.INVALID_VALUE_REFERENCE}: ${source}`);
    if (!Array.isArray(path) || path.length === 0 || path.length > RULE_LIMITS.MAX_PATH_DEPTH) throw new Error(RULE_ERROR_CODES.INVALID_VALUE_REFERENCE);
  }
  if (node.rightRef) {
    const { source, path } = node.rightRef;
    if (!VALUE_REF_SOURCES.includes(source)) throw new Error(`${RULE_ERROR_CODES.INVALID_VALUE_REFERENCE}: ${source}`);
    if (!Array.isArray(path) || path.length === 0 || path.length > RULE_LIMITS.MAX_PATH_DEPTH) throw new Error(RULE_ERROR_CODES.INVALID_VALUE_REFERENCE);
  }
  return count.value;
}

function validateIntents(intents) {
  if (!Array.isArray(intents) || intents.length === 0) return [];
  if (intents.length > RULE_LIMITS.MAX_INTENTS_PER_RULE) throw new Error(RULE_ERROR_CODES.EVALUATION_LIMIT_EXCEEDED);
  return intents.map((intent) => {
    if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new Error(RULE_ERROR_CODES.INVALID_INTENT);
    for (const key of ['intentType', 'targetRef', 'parameters']) {
      if (!(key in intent)) throw new Error(`${RULE_ERROR_CODES.INVALID_INTENT}: missing ${key}`);
    }
    return Object.freeze({ ...intent });
  });
}

export function createRuleDefinition({
  ruleId = `rule_${generateId()}`,
  ruleVersion = '1',
  ruleCode,
  name,
  description = '',
  workspaceId,
  status = RULE_STATUSES.ACTIVE,
  trigger = null,
  conditions = null,
  intents = [],
  priority = 0,
}) {
  if (!ruleCode || typeof ruleCode !== 'string') throw new Error(`${RULE_ERROR_CODES.INVALID_RULE_DEFINITION}: ruleCode is required`);
  if (!/^[A-Z][A-Z0-9_]*$/.test(ruleCode)) throw new Error(`${RULE_ERROR_CODES.INVALID_RULE_DEFINITION}: ruleCode must be UPPER_SNAKE`);
  if (!name?.trim()) throw new Error(`${RULE_ERROR_CODES.INVALID_RULE_DEFINITION}: name is required`);
  if (!workspaceId) throw new Error(`${RULE_ERROR_CODES.INVALID_RULE_DEFINITION}: workspaceId is required`);
  if (!RULE_STATUSES[status]) throw new Error(`${RULE_ERROR_CODES.INVALID_RULE_DEFINITION}: invalid status`);
  if (trigger && trigger.eventType && !Object.values(BUSINESS_EVENT_TYPES).includes(trigger.eventType)) throw new Error(`${RULE_ERROR_CODES.INVALID_EVENT_TYPE}: ${trigger.eventType}`);
  if (conditions) validateConditions(conditions);
  return Object.freeze({
    ruleId,
    ruleVersion,
    ruleCode,
    name: name.trim(),
    description,
    workspaceId,
    status,
    trigger: trigger ? Object.freeze(trigger) : null,
    conditions: conditions ? Object.freeze(conditions) : null,
    intents: Object.freeze((validateIntents(intents) || []).map((i) => Object.freeze(i))),
    priority,
  });
}

/**
 * Canonical taxable reference resolver.
 */
export function resolveValueRef({ source, path }, context) {
  if (!VALUE_REF_SOURCES.includes(source)) throw new Error(RULE_ERROR_CODES.INVALID_VALUE_REFERENCE);
  if (!Array.isArray(path) || path.length === 0) throw new Error(RULE_ERROR_CODES.INVALID_VALUE_REFERENCE);
  if (path.length > RULE_LIMITS.MAX_PATH_DEPTH) throw new Error(RULE_ERROR_CODES.EVALUATION_LIMIT_EXCEEDED);
  const root =
    source === 'EVENT' ? context.event
    : source === 'STATE' ? context.state
    : source === 'CONTEXT' ? context.context
    : source === 'OBJECT' ? context.event?.objectReference
    : context.event?.payload;
  let value = root;
  for (const key of path) {
    if (value === undefined || value === null) return undefined;
    value = value[key];
  }
  return value;
}

/**
 * Unfold a Conditions tree — all comparisons evaluated lazily with the same
 * depth/counter limits.
 */
function evaluateNode(node, context, trace, depth = 0, budget = { value: RULE_LIMITS.MAX_CONDITION_COUNT }) {
  if (!node) return { matched: true, trace: [] };
  if ('and' in node || 'or' in node || 'not' in node) {
    const parts = Array.isArray(node.and) ? node.and : Array.isArray(node.or) ? node.or : [node.not].filter(Boolean);
    const children = parts.map((child) => evaluateNode(child, context, trace, depth + 1, budget));
    if (budget.value < 0) throw new Error(RULE_ERROR_CODES.EVALUATION_LIMIT_EXCEEDED);
    const matched = node.and ? children.every((child) => child.matched) : node.or ? children.some((child) => child.matched) : !children[0].matched;
    return { matched, trace: children.flatMap((c, i) => c.trace.concat([{ kind: node.and ? 'AND' : node.or ? 'OR' : 'NOT', index: i, matched: c.matched }])) };
  }
  if (depth > RULE_LIMITS.MAX_DEPTH) throw new Error(RULE_ERROR_CODES.EVALUATION_LIMIT_EXCEEDED);
  budget.value -= 1;
  if (budget.value < 0) throw new Error(RULE_ERROR_CODES.EVALUATION_LIMIT_EXCEEDED);

  const { op } = node;
  assertOperator(op);
  const left = node.leftRef ? resolveValueRef(node.leftRef, context) : node.leftValue;
  const right = node.rightRef ? resolveValueRef(node.rightRef, context) : node.rightValue;
  const result = OPERATOR_DEFINITIONS[op].apply(left, right);
  trace.push({ kind: 'EVAL', op, left, right, matched: Boolean(result), depth });
  return { matched: Boolean(result), trace };
}

/**
 * Main entry point: `evaluate({ rule, event, state, context })`.
 *
 * Produces a deterministic DecisionResult with traces; never executable.
 */
export function evaluate(rule, { event, state = {}, context = {} }) {
  if (!rule) throw new Error(RULE_ERROR_CODES.UNKNOWN_RULE);
  if (rule.status !== RULE_STATUSES.ACTIVE) return Object.freeze({ matched: false, rule, intents: [], trace: [] });
  if (rule.trigger && rule.trigger.eventType && event?.eventType !== rule.trigger.eventType) return Object.freeze({ matched: false, rule, intents: [], trace: [] });
  // A rule reacting to an event that already traces back to itself indicates an
  // evaluation cycle. `context.event.causeEventId` is the causal parent of the
  // event being evaluated; `context.causationLineage` may carry the full chain.
  const lineage = [
    ...(context.event?.causeEventId ? [context.event.causeEventId] : []),
    ...(Array.isArray(context.causationLineage) ? context.causationLineage : []),
  ];
  if (event?.eventId && lineage.includes(event.eventId)) throw new Error(RULE_ERROR_CODES.RULE_CYCLE_DETECTED);
  const trace = [];
  let matched = true;
  if (rule.conditions) {
    ({ matched } = evaluateNode(rule.conditions, { event, state, context }, trace));
  }
  const intents = matched ? rule.intents.map((intent) => Object.freeze({ ...intent, ruleId: rule.ruleId, ruleVersion: rule.ruleVersion, sourceEventId: event?.eventId })) : [];
  return Object.freeze({
    matched,
    rule,
    ruleVersion: rule.ruleVersion,
    intents: Object.freeze(intents),
    trace: Object.freeze(trace.slice(0, RULE_LIMITS.MAX_TRACE_ENTRIES)),
  });
}

/**
 * Multiple rules → ordered deterministic results. Priority desc, then
 * ruleCode asc.
 */
export function evaluateAll(rules, input, { includeInactive = false } = {}) {
  const limited = [...rules].slice(0, RULE_LIMITS.MAX_RULES_PER_EVALUATION);
  const sorted = limited.sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.ruleCode.localeCompare(b.ruleCode));
  const results = sorted.map((rule) => evaluate(rule, input));
  return Object.freeze(results.filter((result) => includeInactive || result.matched !== false || result.intents.length > 0));
}

export function ruleOperations() {
  return Object.freeze(Object.keys(OPERATOR_DEFINITIONS));
}
