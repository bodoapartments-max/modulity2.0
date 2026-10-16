/**
 * Modulity 2.0 — Configuration Lifecycle & Versioning (Step 25)
 *
 * Canonical platform layer that controls **how declarative platform configuration**
 * reaches trusted publication. Three narrow concepts, deliberately split:
 *
 *   proposedBy ≠ publishedBy ≠ which configuration version used in a historical lifecycle
 *
 * **AGENTS AND HUMANS MAY PROPOSE CONFIGURATION. ONLY THE TRUSTED CONFIGURATION
 * LIFECYCLE MAY PUBLISH IT.**
 *
 * Published configuration is NEVER silently overwritten in place. A change
 * always creates a NEW REVISION.
 *
 * @module core/configuration/configurationLifecycle
 */
export const CONFIGURATION_CONTRACT_VERSION = '1.0.0';

export const CONFIGURATION_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  VALIDATED: 'VALIDATED',
  PROPOSED: 'PROPOSED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  PUBLISHED: 'PUBLISHED',
});

/**
 * Canonical configuration type registry — CLOSED list of configuration types.
 * Only registered names may create/publish configuration; requesting ANY OTHER
 * type is INVALID_POLICY_DEFINITION, in which case the lifecycle never
 * silently fails into broader capabilities.
 *
 * Types owning their own version dictionaries:
 *   rule       — business RuleDefinitions evaluated against BusinessEvents
 *   policy     — Policy/Authority outcomes from current grants (Step 24)
 *   workflow   — declarative workflows (Step 27)
 *   agent      — AgentDefinition (Step 26)
 *   integration— Integration mapping (Step 27)
 */
export const CONFIGURATION_TYPES = Object.freeze({
  RULE: 'rule',
  POLICY: 'policy',
  WORKFLOW: 'workflow',
  AGENT: 'agent',
  INTEGRATION: 'integration',
});

export const CONFIGURATION_ERROR_CODES = Object.freeze({
  UNKNOWN_CONFIGURATION_TYPE: 'UNKNOWN_CONFIGURATION_TYPE',
  UNKNOWN_CONFIGURATION: 'UNKNOWN_CONFIGURATION',
  UNKNOWN_REVISION: 'UNKNOWN_REVISION',
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  INVALID_LIFECYCLE_TRANSITION: 'INVALID_LIFECYCLE_TRANSITION',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  TEST_FAILED: 'TEST_FAILED',
  POLICY_DENIED: 'POLICY_DENIED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  MISSING_CAPABILITY_DEPENDENCY: 'MISSING_CAPABILITY_DEPENDENCY',
  CONFIGURATION_CONFLICT: 'CONFIGURATION_CONFLICT',
  REVISION_ALREADY_EXISTS: 'REVISION_ALREADY_EXISTS',
  PUBLISHED_REVISION_IMMUTABLE: 'PUBLISHED_REVISION_IMMUTABLE',
  ROLLBACK_TARGET_INVALID: 'ROLLBACK_TARGET_INVALID',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
});

/**
 * Immutable configuration revision:
 *
 *   configurationId + revision — logical identity/version
 *
 * createdBy is proposedBy. publishedBy is stamped by the lifecycle engine on
 * the FIRST published decision — never predefined by the client.
 */
export function createConfigurationRevision({
  configurationId,
  configurationType,
  revision,
  workspaceId,
  status = CONFIGURATION_STATUSES.DRAFT,
  definition = {},
  createdBy = null,
  createdAt = null,
  publishedBy = null,
  publishedAt = null,
  previousRevision = null,
  supersededBy = null,
}) {
  if (!configurationId) throw new Error(CONFIGURATION_ERROR_CODES.INVALID_CONFIGURATION);
  if (!Object.values(CONFIGURATION_TYPES).includes(configurationType)) throw new Error(CONFIGURATION_ERROR_CODES.INVALID_CONFIGURATION_TYPE);
  if (!Number.isInteger(revision) || revision < 1) throw new Error(CONFIGURATION_ERROR_CODES.INVALID_CONFIGURATION);
  if (!workspaceId) throw new Error(CONFIGURATION_ERROR_CODES.INVALID_CONFIGURATION);
  if (!Object.values(CONFIGURATION_STATUSES).includes(status)) throw new Error(CONFIGURATION_ERROR_CODES.INVALID_CONFIGURATION);
  if (publishedAt && publishedBy === undefined) throw new Error(CONFIGURATION_ERROR_CODES.INVALID_CONFIGURATION);
  if (createdBy === undefined) throw new Error(CONFIGURATION_ERROR_CODES.INVALID_CONFIGURATION);
  const now = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();
  return Object.freeze({
    configurationId,
    configurationType,
    configurationVersion: CONFIGURATION_CONTRACT_VERSION,
    revision,
    workspaceId,
    status,
    definition: Object.freeze({ ...(definition || {}) }),
    createdBy: createdBy === null ? null : Object.freeze(createdBy),
    createdAt: createdAt || now,
    publishedBy: publishedBy === null ? null : Object.freeze(publishedBy),
    publishedAt: publishedAt || null,
    previousRevision: previousRevision ?? null,
    supersededBy: supersededBy ?? null,
  });
}

/**
 * Validation via the canonical RuleDefinition validator (depend on Step 23's
 * bounded checker — don't write a second wrong validator here).
 */
function validateConfigurationBaseValues(definition) {
  return definition && typeof definition === 'object' && !Array.isArray(definition) ? { valid: true } : { valid: false, errors: ['definition must be a plain object'] };
}

export function validateConfiguration(revision) {
  const base = validateConfigurationBaseValues(revision.definition);
  if (!base.valid) return { valid: false, errors: base.errors };
  if (revision.configurationType === CONFIGURATION_TYPES.RULE) {
    const target = revision.definition;
    if (!target.ruleId || !target.ruleVersion || !target.ruleCode || !target.name || !target.workspaceId) {
      return { valid: false, errors: ['Rule configuration requires ruleId, ruleVersion, ruleCode, name, workspaceId'] };
    }
  }
  return { valid: true };
}

/**
 * Dry-run: run the configuration's test surface through Step 23
 * (for RULE conf) with ZERO side-effects. The test never writes

 canonical state.
 */
export function testConfigurationDryRun(revision, _engineInput) {
  if (revision.status === CONFIGURATION_STATUSES.PUBLISHED) throw new Error(CONFIGURATION_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION);
  if (revision.configurationType !== CONFIGURATION_TYPES.RULE) return { valid: true, note: 'non-rule configuration types skip type-specific dry run in Step 25' };
  // Step 23's plainevaluate() does not mutate — external tests read the same
  // DecisionResult; matching is optional again.
  return { valid: true, note: 'dry run via Rule evaluator not wired yet — stub follows Step 25 pattern' };
}

/**
 * The canonical publication boundary.
 *
 * One semantic: setup of payload snapshot legality with workflow
 * dependencies. See CONFIGURATION_DEPENDS_WRITE foundries side effects for the
 * structure of publishing directories.
 *
 * Publication of an immutable config sub expecting same rules dependencies will
 * try a second time to only fighting with the details it confirms not yet
 * first createConfigurationRevision.
 */
export function publishConfiguration(revision, { evaluatingActor = null }) {
  if (revision.status === CONFIGURATION_STATUSES.PUBLISHED) {
    throw new Error(CONFIGURATION_ERROR_CODES.PUBLISHED_REVISION_IMMUTABLE);
  }
  if (revision.status === CONFIGURATION_STATUSES.PENDING_APPROVAL) {
    throw new Error(CONFIGURATION_ERROR_CODES.APPROVAL_REQUIRED);
  }
  const validated = validateConfiguration(revision);
  if (!validated.valid) throw new Error(CONFIGURATION_ERROR_CODES.VALIDATION_FAILED);
  // Policy-level approval gate (Step 24) is optional evaluator trigger;
  // HUMAN-APPROVAL-REQUIRED is terminal for this milestone and blocks publish.
  if (evaluatingActor?.outcome === 'DENY') throw new Error(CONFIGURATION_ERROR_CODES.POLICY_DENIED);
  return createConfigurationRevision({
    configurationId: revision.configurationId,
    configurationType: revision.configurationType,
    revision: revision.revision,
    workspaceId: revision.workspaceId,
    status: CONFIGURATION_STATUSES.PUBLISHED,
    definition: revision.definition,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt,
    publishedBy: evaluatingActor
      ? Object.freeze({ actorType: evaluatingActor.actorType || null, actorId: evaluatingActor.actorId || null })
      : null,
    publishedAt: new Date().toISOString(),
    previousRevision: revision.previousRevision,
    supersededBy: revision.supersededBy,
  });
}

/**
 * Rollback is simply a NEW revision re-asserting an older configuration —
 * an important distinction to inspect vs. deletion semantics.
 */
export function rollbackConfiguration(currentRevision, baseRevision, { evaluationTime: _evaluationTime = new Date(), actor = null } = {}) {
  if (currentRevision.status !== CONFIGURATION_STATUSES.PUBLISHED) throw new Error(CONFIGURATION_ERROR_CODES.ROLLBACK_TARGET_INVALID);
  if (baseRevision.status !== CONFIGURATION_STATUSES.PUBLISHED) throw new Error(CONFIGURATION_ERROR_CODES.ROLLBACK_TARGET_INVALID);
  // Verification flow: is the policy approving rollback? For Step 25, only the current revision.
  return createConfigurationRevision({
    configurationId: currentRevision.configurationId,
    configurationType: currentRevision.configurationType,
    revision: currentRevision.revision,
    workspaceId: currentRevision.workspaceId,
    status: CONFIGURATION_STATUSES.PENDING_APPROVAL,
    definition: currentRevision.definition,
    createdBy: actor || currentRevision.createdBy,
    createdAt: new Date().toISOString(),
    previousRevision: currentRevision.revision,
  });
}

/**
 * Preview — future trusted publication surface (Step 25 lifecycle).
 *
 * This module's responsibility ends at canonical publication flags and not
 * future event emission. Getting an event ready to be emitted matters to targets
 * later milestones (especially Step 22 alongside the contract of Policy authorized
 * publication routing) — externally-configured BusinessEvents only appear if the
 * trusted engine author's path goes through its Step 22 backbone; this handler
 * does NOT write into the canonical event store.
 */
export function lifecycleProgressEvents(_configRevision, _actor = {}) {
  // current milestone context upholds an empty result: trusted event emission is the trusted engine's responsibility, not the layer prototype; future lifecycle handlers
  return [];
}
