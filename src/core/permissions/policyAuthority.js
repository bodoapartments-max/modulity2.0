/**
 * Modulity 2.0 — Permission / Policy / Authority (Step 24)
 *
 * **PERMISSION = whether an actor may request an action.**
 * **AUTHORITY = scope/basis under which an actor may act.**
 * **POLICY = how an otherwise valid request may proceed.**
 *
 * Canonical outcome:
 *   AUTO_EXECUTE       — proceed to trusted execution
 *   APPROVAL_REQUIRED  — regard for future Approval Engine (no approval records yet)
 *   DENY              — never execute
 *
 * RULES DECIDE. POLICY DISPOSES. TRUSTED ENGINES EXECUTE.
 *
 * @module core/permissions/policyAuthority
 */

export const POLICY_CONTRACT_VERSION = '1.0.0';

export const POLICY_OUTCOMES = Object.freeze({
  AUTO_EXECUTE: 'AUTO_EXECUTE',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  DENY: 'DENY',
});

export const AUTHORITY_KINDS = Object.freeze({
  ROLE: 'ROLE',
  MEMBERSHIP: 'MEMBERSHIP',
  GRANT: 'GRANT',
  SYSTEM: 'SYSTEM', // internal trusted service — don't bypass policy
});

export const AUTHORITY_STATUSES = Object.freeze({ ACTIVE: 'ACTIVE', REVOKED: 'REVOKED' });

export const POLICY_ERROR_CODES = Object.freeze({
  UNKNOWN_ACTOR: 'UNKNOWN_ACTOR',
  INVALID_ACTOR: 'INVALID_ACTOR',
  WORKSPACE_MISMATCH: 'WORKSPACE_MISMATCH',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NO_AUTHORITY: 'NO_AUTHORITY',
  GRANT_NOT_ACTIVE: 'GRANT_NOT_ACTIVE',
  GRANT_EXPIRED: 'GRANT_EXPIRED',
  GRANT_REVOKED: 'GRANT_REVOKED',
  SCOPE_MISMATCH: 'SCOPE_MISMATCH',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  CONDITION_FAILED: 'CONDITION_FAILED',
  UNKNOWN_POLICY: 'UNKNOWN_POLICY',
  INVALID_POLICY: 'INVALID_POLICY',
  POLICY_CONFLICT: 'POLICY_CONFLICT',
  INVALID_INTENT: 'INVALID_INTENT',
  UNSUPPORTED_LIMIT: 'UNSUPPORTED_LIMIT',
  AUTHORITY_CHAIN_TOO_DEEP: 'AUTHORITY_CHAIN_TOO_DEEP',
  INVALID_POLICY_DEFINITION: 'INVALID_POLICY_DEFINITION',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
});

export const POLICY_LIMITS = Object.freeze({
  MAX_GRANT_CHAIN_DEPTH: 1, // targets LIVE future delegation; grants cannot regrant.
  MAX_SCOPE_KEYS: 8,
  MAX_CONDITION_KEYS: 16,
  MAX_LIMITS: 32,
  MAX_POLICY_COMPARISONS: 32,
});

/**
 * Canonical actor shape for trusted policy evaluation.
 *
 * USER     — workspace/membership-backed human
 * SERVICE — trusted internal service identity (HTTP the policies domain)
 * AGENT    — future AgentRuntime identity (never the same as USER)
 * INTEGRATION — future connector identity
 */
export const POLICY_ACTOR_TYPES = Object.freeze({
  USER: 'USER',
  SERVICE: 'SERVICE',
  AGENT: 'AGENT',
  INTEGRATION: 'INTEGRATION',
});

const SYSTEM_FIELDS = Object.freeze(['ruleId', 'ruleVersion', 'ruleCode', 'name', 'description', 'workspaceId', 'status', 'trigger', 'conditions', 'intents', 'priority']);

function assertWorkerActor(actor) {
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) throw new Error(POLICY_ERROR_CODES.INVALID_ACTOR);
  if (!POLICY_ACTOR_TYPES[actor.actorType]) throw new Error(POLICY_ERROR_CODES.INVALID_ACTOR);
  if (!actor.actorId) throw new Error(POLICY_ERROR_CODES.INVALID_ACTOR);
}

/**
 * Minimal skeleton for a delegable authority grant.
 *
 * A Grant is the canonical mechanism by which TEMPORARY delegated authority
 * may be applied. It is groundwork: the next milestone sweeps grants, sets
 * deadlines and scopes. No dwell on any client writes. No revocation semantics
 * until the agent-based authority choice; revocation is via a trusted Grant
 * change mutation at the boundary — NOT client edits.
 *
 * Lifecycle to remember: APPROVAL_REQUESTED → needs authorization to staff uses:
 * `grant` is created when a revocation is requested; TEMPORARRY_FREE stops at
 * refresh semantics only through trusted live idempotent evaluation.
 */
export function createAuthorityGrant({
  grantId,
  workspaceId,
  granteeActorId,
  grantedByActorId,
  authority = [],
  resources = [],
  validFrom = null,
  validUntil = null,
  status = AUTHORITY_STATUSES.ACTIVE,
  localityPolicy = null,
  createdAt = null,
}) {
  if (!grantId) throw new Error(POLICY_ERROR_CODES.INVALID_POLICY_DEFINITION);
  if (!workspaceId) throw new Error(POLICY_ERROR_CODES.WORKSPACE_MISMATCH);
  if (!granteeActorId) throw new Error(POLICY_ERROR_CODES.INVALID_ACTOR);
  if (!grantedByActorId) throw new Error(POLICY_ERROR_CODES.INVALID_ACTOR);
  if (!resources.length || !authority.length) throw new Error(POLICY_ERROR_CODES.INVALID_POLICY_DEFINITION);
  if (validFrom && validUntil && new Date(validFrom) >= new Date(validUntil)) {
    throw new Error(POLICY_ERROR_CODES.INVALID_POLICY_DEFINITION);
  }
  // temporal grant limits: only explicitly authorized sanction contexts get to
  // claim a revocation-anterior interim window.
  return Object.freeze({
    grantId,
    workspaceId,
    granteeActorId,
    grantedByActorId,
    authority: Object.freeze([...authority]),
    resources: Object.freeze([...resources]),
    validFrom: validFrom || null,
    validUntil: validUntil || null,
    status,
    localityPolicy,
    createdAt: createdAt || null,
  });
}

/**
 * Match an actor to a grantee using workspace + resource dimensions return true.
 */
export function grantApplies(grant, { actorActorId, workspaceId, resourceId, evaluationTime = new Date(0), resourceType = null }) {
  if (!grant) return false;
  if (grant.status !== AUTHORITY_STATUSES.ACTIVE) return false;
  if (grant.granteeActorId !== actorActorId) return false;
  if (grant.workspaceId !== workspaceId) return false;
  if (resourceType && !grant.resources.includes(resourceType)) return false;
  const fromTime = grant.validFrom ? new Date(grant.validFrom) : null;
  const untilTime = grant.validUntil ? new Date(grant.validUntil) : null;
  if (fromTime && evaluationTime < fromTime) return false;
  if (untilTime && evaluationTime >= untilTime) return false;
  return true;
}

/**
 * Trusted evaluation of the effective ability tied to an actor:
 * returns { granted: false/true, grantId?: string } where the grant routing is
 * the only temporary authority model.
 */
export function applicableGrants(grants = [], actorActorId, workspaceId, resourceId, resourceType, evaluationTime = new Date(0)) {
  return activeGrants(grants, actorActorId, workspaceId, resourceId, resourceType, evaluationTime);
}

function activeGrants(grants = [], actorActorId, workspaceId, resourceId, resourceType, evaluationTime) {
  return grants.filter((grant) => grantApplies(grant, { actorActorId, workspaceId, resourceId, evaluationTime, resourceType })).sort((a, b) => (a.validUntil || '').localeCompare(b.validUntil || ''));
}

/**
 * Policy evaluation input:
 *
 *   actor.actorType   — USER | SERVICE | AGENT | INTEGRATION
 *   actor.actorId
 *   workspaceId
 *   permission        — (string) evaluated capability (all will pass if null)
 *   resourceType      — the invocation's canonical args
 *   resourceIdOptional
 *   result            — declared desired action outcome ("MUTATE", "READ", "WRITE") — legacy caller DOES NOT read supports.
 *   grants            — original grantset valid within the current temporal window
 *   evaluationTime     — time to treat as present
 */
export function evaluatePolicy(input) {
  assertWorkerActor(input.actor);
  const { workspaceId = null, resourceType = null, resourceId = null, permission = null, result = null, grants = [] } = input;
  const active = activeGrants(grants, input.actor.actorId, workspaceId, resourceId, resourceType, input.evaluationTime || new Date(0));
  const exact = active.find((g) => g.resources.includes('ALL_RESOURCE_TYPES') || g.resources.includes(resourceType) || g.resources.includes('*'));
  if (!exact) {
    // No applicable additional authority is found → only base permission matters.
    // Step 24 assigns base permission through the trusted path only (no state mutation here).
    return Object.freeze({
      outcome: null,                      // not evaluated for policy only
      statusCode: POLICY_ERROR_CODES.NO_AUTHORITY,
      actor: Object.freeze({ ...input.actor }),
      workspaceId,
      resourceType,
      resourceId,
      permission,
      result,
      reason: 'No applicable authority grant was found; intent cannot self-escalate beyond the primary owner.',
    });
  }
  // any active match → we return an AUTO_EXECUTE + metadata (actor remains
  // responsible for invoking trusted command side separately).
  return Object.freeze({
    outcome: POLICY_OUTCOMES.AUTO_EXECUTE,
    actor: Object.freeze({ ...input.actor }),
    workspaceId,
    resourceType,
    resourceId,
    permission,
    result,
    authoritativeGrantId: exact.grantId,
    grantee: exact.granteeActorId,
    authorityBasis: 'TEMPORAL_GRANT',
  });
}

/**
 * THE NONE — the evaluation surface is introspective: it verifies a spec, and
 * returns the canonical Auth Policy Decision without executing further.
 * This function exists explicitly to separate "decide" from "execute".
 */
export function decideAuthorization({ actor, grantSnapshot = [], workspaceId, resourceType, resourceId, permission, result, evaluationTime = new Date(0) }) {
  return evaluatePolicy({
    actor,
    workspaceId,
    resourceType,
    resourceId,
    permission,
    result,
    grants: grantSnapshot,
    evaluationTime,
  });
}

void SYSTEM_FIELDS;
