/**
 * Modulity 2.0 — Simulation / Dry-Run Engine (Step 26)
 *
 * Production ≠ simulation. Simulation is an immutable overlay evaluation —
 * the definitive answer to "what WOULD happen?" without production writes.
 *
 * Rule ≠ Policy ≠ Authority ≠ Insurance. Terms here are closely joined:
 * Rule decides, Policy decides how requests route afterwards, Authorization
 * decides the actor's validity during specific windows.
 *
 * @module core/simulation/simulationEngine
 */
import { evaluate as evaluateRuleDefinition } from '../rules/ruleDefinition.js';
import { decideAuthorization, POLICY_ACTOR_TYPES, POLICY_ERROR_CODES, POLICY_OUTCOMES } from '../permissions/policyAuthority.js'; // eslint-disable-line no-unused-vars -- kept stable for future milestones

export const SIMULATION_CONTRACT_VERSION = '1.0.0';

export const SIMULATION_LIMITS = Object.freeze({
  MAX_STEPS: 32,
  MAX_RULE_EVALUATIONS: 64,
  MAX_POLICY_EVALUATIONS: 64,
  MAX_TRANSITIONS: 32,
  MAX_PROJECTED_EVENTS: 32,
  MAX_STATE_OVERLAY_ENTRIES: 256,
  MAX_TRACE_ENTRIES: 128,
  MAX_DEPTH: 16,
});

export const SIMULATION_ERROR_CODES = Object.freeze({
  WORKSPACE_MISMATCH: 'WORKSPACE_MISMATCH',
  INVALID_BASE_STATE: 'INVALID_BASE_STATE',
  UNKNOWN_CONFIGURATION_REVISION: 'UNKNOWN_CONFIGURATION_REVISION',
  MISSING_CAPABILITY_DEPENDENCY: 'MISSING_CAPABILITY_DEPENDENCY',
  INVALID_TRANSITION_INTENT: 'INVALID_TRANSITION_INTENT',
  POLICY_DENIED: 'POLICY_DENIED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  SIMULATION_CYCLE_DETECTED: 'SIMULATION_CYCLE_DETECTED',
  SIMULATION_LIMIT_EXCEEDED: 'SIMULATION_LIMIT_EXCEEDED',
  STATE_OVERLAY_LIMIT_EXCEEDED: 'STATE_OVERLAY_LIMIT_EXCEEDED',
  INVALID_SIMULATION_REQUEST: 'INVALID_SIMULATION_REQUEST',
});

export const SIMULATION_DISPOSITIONS = Object.freeze({
  AUTO_EXECUTE: 'AUTO_EXECUTE',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  DENY: 'DENY',
});

export const PROJECTED_EVENT_TYPE = 'be_projected';

/** Immutable deep-cloned state overlay — production base untouched. */
export function createStateOverlay(baseState, overlayEntries = []) {
  if (!baseState || typeof baseState !== 'object') throw new Error(SIMULATION_ERROR_CODES.INVALID_BASE_STATE);
  const cloned = structuredClone(baseState);
  return Object.freeze({
    __isOverlay: true,
    baseRef: Object.freeze(cloned),
    entries: Object.freeze(overlayEntries.map((e) => Object.freeze({ ...e }))),
  });
}

function resourceTypeOf(eventPayload) {
  const tag = eventPayload?.payload?.resourceType ?? eventPayload?.payload?.objectKind ?? eventPayload?.payload?.objectType;
  return typeof tag === 'string' ? tag : null;
}

function intentToPermission(intentType) {
  if (!intentType) return null;
  // RULE_xxx intents map to the canonical permission identifier directly.
  if (String(intentType).startsWith('RULE_')) return String(intentType).substring(5).toLowerCase();
  return String(intentType).toLowerCase();
}

function eventIdOf(event, rule) { return event?.eventId || `be_sim_${rule?.ruleCode ?? 'x'}`; }

function matchedProjectionEvents(ruleResult, inputEvent, eventId) {
  if (!ruleResult.matched) return [];
  return ruleResult.intents.map((intent, i) => Object.freeze({
    __projectedEvent: true,
    eventId: `${eventId}-proj-${i}`,
    intentType: intent.intentType,
    targetRef: intent.targetRef,
    parameters: intent.parameters,
    sourceEventId: inputEvent?.eventId || null,
    ruleId: ruleResult.rule?.ruleId,
    ruleVersion: ruleResult.rule?.ruleVersion,
  }));
}

/**
 * Evaluate a single rule-with-optional-policy decision WITHOUT mutation.
 * Simulation orchestrates the real engines — never silently executes them.
 */
export function evaluateSimulatedTransition({ rule, event, state, context, actor, authority = [] }, workspaceId) {
  if (!rule) throw new Error(SIMULATION_ERROR_CODES.INVALID_SIMULATION_REQUEST);
  const ruleOutcome = evaluateRuleDefinition(rule, { event, state, context });
  const comparableIntents = ruleOutcome.intents.filter((intent) => intent.intentType);
  let policy = null;
  if (ruleOutcome.matched && comparableIntents.length > 0) {
    const eligibleAuthority = authority.find((a) => a.granteeActorId === actor?.actorId
      || 'simulation.anonymous' === actor?.actorId);
    const authDec = decideAuthorization({
      actor: { actorType: actor?.actorType || POLICY_ACTOR_TYPES.USER, actorId: actor?.actorId || 'simulation.anonymous' },
      grantSnapshot: eligibleAuthority ? [eligibleAuthority] : [],
      workspaceId,
      resourceType: resourceTypeOf(event),
      resourceId: event?.objectReference?.id || null,
      permission: intentToPermission(comparableIntents[0]?.intentType),
      evaluationTime: context?.evaluationTime ? new Date(context.evaluationTime) : new Date(0),
    });
    policy = authDec.statusCode === POLICY_ERROR_CODES.GRANT_REVOKED ? POLICY_ERROR_CODES.GRANT_REVOKED : authDec.outcome ?? null;
  }
  const projected = matchedProjectionEvents(ruleOutcome, event, eventIdOf(event, ruleOutcome.rule?.ruleCode));
  return Object.freeze({
    actor: actor ? Object.freeze({ ...actor }) : null,
    intents: Object.freeze(comparableIntents),
    ruleOutcome,
    policy,
    projectedEvents: projected,
  });
}

/**
 * Multi-step projection over canonical events (simulated ALL THE WAY).
 * The event chain transitions through deterministic projection only.
 */
export function simulateScenario({ runId, workspaceId, actor, inputEvent, state, context = {}, authority = [], steps = [] }) {
  if (!runId) throw new Error(SIMULATION_ERROR_CODES.INVALID_SIMULATION_REQUEST);
  if (steps.length > SIMULATION_LIMITS.MAX_STEPS) throw new Error(SIMULATION_ERROR_CODES.SIMULATION_LIMIT_EXCEEDED);
  let currentEvent = inputEvent;
  let currentState = state;
  const decisions = [];
  const producedProjectedEvents = [];
  const lineage = [];

  for (const step of steps) {
    if (!step) continue;
    const marker = `${step.ruleCode ?? ''}:${step.intentType ?? ''}`;
    if (marker.trim() && lineage.includes(marker)) {
      throw new Error(SIMULATION_ERROR_CODES.SIMULATION_CYCLE_DETECTED);
    }
    lineage.push(marker);

    const ruleResult = evaluateRuleDefinition(step.rule, { event: currentEvent, state: currentState, context: { ...context, evaluationTime: context.evaluationTime } });
    let perPolicy = null;
    if (ruleResult.matched && ruleResult.intents.length > 0) {
      for (const intent of ruleResult.intents) {
        perPolicy = decideAuthorization({
          actor: { actorType: 'USER', actorId: actor?.actorId || 'simulation.anonymous' },
          grantSnapshot: authority,
          workspaceId,
          resourceType: resourceTypeOf(currentEvent),
          resourceId: currentEvent?.objectReference?.id || null,
          permission: intentToPermission(intent.intentType),
          evaluationTime: context.evaluationTime ? new Date(context.evaluationTime) : new Date(0),
        });
      }
    }

    decisions.push(Object.freeze({
      rule: step.ruleCode,
      inputEventType: currentEvent?.eventType,
      matched: ruleResult.matched,
      policies: perPolicy,
      explanation: ruleResult.trace.slice(0, SIMULATION_LIMITS.MAX_TRACE_ENTRIES).map((entry) => Object.freeze({ ...entry })),
      projectedEvents: matchedProjectionEvents(ruleResult, currentEvent, eventIdOf(currentEvent, step)),
    }));
    producedProjectedEvents.push(...decisions[decisions.length - 1].projectedEvents);

    if (ruleResult.matched) {
      if (steps.indexOf(step) < steps.length - 1) {
        currentEvent = step.projectOutputType ? { ...currentEvent, eventId: eventIdOf(currentEvent, step), eventType: step.projectOutputType } : currentEvent;
      } else {
        break;
      }
    }
  }

  return Object.freeze({
    runId,
    workspaceId,
    decisions: Object.freeze(decisions),
    projectedEvents: Object.freeze(producedProjectedEvents.map((x) => Object.freeze(x))),
    trace: Object.freeze(lineage.slice(0, SIMULATION_LIMITS.MAX_TRACE_ENTRIES)),
    cycleDetected: false,
  });
}

function safePolicyActorType(actor) {
  return POLICY_ACTOR_TYPES[actor?.actorType] ? actor.actorType : POLICY_ACTOR_TYPES.USER;
}

void POLICY_ERROR_CODES;
void safePolicyActorType;
