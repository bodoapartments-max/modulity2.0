import { AGENT_PROVIDER_TYPES, AGENT_STATUSES } from '../contracts/agentContracts.js';
import { validateOrganizationAnalysisInput, validateOrganizationAnalysisOutput } from '../automat/automatContracts.js';

export const PLANNING_SCHEMA_VERSION = '1.0.0';
export const PLANNING_AGENT_CODES = Object.freeze({ ORGANIZATION_ANALYZER: 'ORGANIZATION_ANALYZER', DOMAIN_MODEL_PLANNER: 'DOMAIN_MODEL_PLANNER', PROCESS_PLANNER: 'PROCESS_PLANNER', MODULE_PLANNER: 'MODULE_PLANNER', WORKSPACE_EXPERIENCE_PLANNER: 'WORKSPACE_EXPERIENCE_PLANNER', SYSTEM_REVIEWER: 'SYSTEM_REVIEWER' });

const strict = (value, allowed, required, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${label} contains unknown properties: ${unknown.join(', ')}`);
  for (const key of required) if (value[key] === undefined || value[key] === null) throw new Error(`${label}.${key} is required`);
  if (value.schemaVersion !== PLANNING_SCHEMA_VERSION) throw new Error(`${label} schema version is unsupported`);
  return true;
};
const arrays = (value, keys, label) => { for (const key of keys) if (!Array.isArray(value[key])) throw new Error(`${label}.${key} must be an array`); return true; };

export function createPlanningAgentDefinitions() {
  return Object.values(PLANNING_AGENT_CODES).map((agentCode) => ({ agentId: `agent:${agentCode.toLowerCase().replaceAll('_', '-')}`, agentCode, name: agentCode.split('_').map((word) => word[0] + word.slice(1).toLowerCase()).join(' '), description: `Structured ${agentCode.toLowerCase().replaceAll('_', ' ')} stage`, version: '1.0.0', capability: agentCode === PLANNING_AGENT_CODES.ORGANIZATION_ANALYZER ? 'automat.organization_analysis' : 'automat.system_builder', inputSchemaVersion: PLANNING_SCHEMA_VERSION, outputSchemaVersion: PLANNING_SCHEMA_VERSION, status: AGENT_STATUSES.ACTIVE, providerAdapter: AGENT_PROVIDER_TYPES.DETERMINISTIC_TEST, timeoutPolicy: { timeoutMs: 5_000 }, metadata: { planningOnly: true } }));
}

export const planningInputValidators = Object.freeze({
  'ORGANIZATION_ANALYZER@1.0.0': validateOrganizationAnalysisInput,
  'DOMAIN_MODEL_PLANNER@1.0.0': (value) => strict(value, ['schemaVersion', 'analysis'], ['schemaVersion', 'analysis'], 'DomainModelPlannerInput'),
  'PROCESS_PLANNER@1.0.0': (value) => strict(value, ['schemaVersion', 'analysis', 'domainModel'], ['schemaVersion', 'analysis', 'domainModel'], 'ProcessPlannerInput'),
  'MODULE_PLANNER@1.0.0': (value) => strict(value, ['schemaVersion', 'analysis', 'domainModel', 'processPlan'], ['schemaVersion', 'analysis', 'domainModel', 'processPlan'], 'ModulePlannerInput'),
  'WORKSPACE_EXPERIENCE_PLANNER@1.0.0': (value) => strict(value, ['schemaVersion', 'analysis', 'domainModel', 'processPlan', 'modulePlan'], ['schemaVersion', 'analysis', 'domainModel', 'processPlan', 'modulePlan'], 'WorkspaceExperiencePlannerInput'),
  'SYSTEM_REVIEWER@1.0.0': (value) => strict(value, ['schemaVersion', 'analysis', 'domainModel', 'processPlan', 'modulePlan', 'experiencePlan'], ['schemaVersion', 'analysis', 'domainModel', 'processPlan', 'modulePlan', 'experiencePlan'], 'SystemReviewerInput'),
});

export const planningOutputValidators = Object.freeze({
  'ORGANIZATION_ANALYZER@1.0.0': validateOrganizationAnalysisOutput,
  'DOMAIN_MODEL_PLANNER@1.0.0': (value) => { strict(value, ['schemaVersion', 'domainObjects', 'proposedEntityTypes', 'proposedRelationships'], ['schemaVersion', 'domainObjects', 'proposedEntityTypes', 'proposedRelationships'], 'DomainModelPlan'); return arrays(value, ['domainObjects', 'proposedEntityTypes', 'proposedRelationships'], 'DomainModelPlan'); },
  'PROCESS_PLANNER@1.0.0': (value) => { strict(value, ['schemaVersion', 'processes', 'capabilities'], ['schemaVersion', 'processes', 'capabilities'], 'ProcessPlan'); return arrays(value, ['processes', 'capabilities'], 'ProcessPlan'); },
  'MODULE_PLANNER@1.0.0': (value) => { strict(value, ['schemaVersion', 'proposedModules'], ['schemaVersion', 'proposedModules'], 'ModulePlan'); return arrays(value, ['proposedModules'], 'ModulePlan'); },
  'WORKSPACE_EXPERIENCE_PLANNER@1.0.0': (value) => { strict(value, ['schemaVersion', 'proposedWorksets', 'proposedWidgets', 'proposedReports'], ['schemaVersion', 'proposedWorksets', 'proposedWidgets', 'proposedReports'], 'WorkspaceExperiencePlan'); return arrays(value, ['proposedWorksets', 'proposedWidgets', 'proposedReports'], 'WorkspaceExperiencePlan'); },
  'SYSTEM_REVIEWER@1.0.0': (value) => { strict(value, ['schemaVersion', 'warnings', 'unresolvedQuestions', 'assumptions', 'diagnostics'], ['schemaVersion', 'warnings', 'unresolvedQuestions', 'assumptions', 'diagnostics'], 'SystemReview'); return arrays(value, ['warnings', 'unresolvedQuestions', 'assumptions'], 'SystemReview'); },
});
