export const AUTOMAT_PLAN_VERSION = '1.0.0';
export const AUTOMAT_PLAN_STATUSES = Object.freeze({ DRAFT: 'DRAFT', ANALYZING: 'ANALYZING', READY_FOR_REVIEW: 'READY_FOR_REVIEW', INVALID: 'INVALID', APPROVED: 'APPROVED', APPLYING: 'APPLYING', APPLIED: 'APPLIED', FAILED: 'FAILED', SUPERSEDED: 'SUPERSEDED' });
export const PLAN_OPERATION_CLASSIFICATIONS = Object.freeze({ CREATE: 'CREATE', REUSE: 'REUSE', SAFE_UPDATE: 'SAFE_UPDATE', CONFLICT: 'CONFLICT', UNSUPPORTED: 'UNSUPPORTED' });
export const PLAN_REF_KINDS = Object.freeze({ ENTITY_TYPE: 'entityType', MODULE: 'module', RELATIONSHIP: 'relationship', WORKSET: 'workset', WIDGET: 'widget', REPORT: 'report' });
export const AUTOMAT_BOUNDS = Object.freeze({ MAX_ENTITY_TYPES: 50, MAX_MODULES: 50, MAX_RELATIONSHIPS: 100, MAX_WORKSETS: 25, MAX_WIDGETS: 50, MAX_REPORTS: 50, MAX_BUSINESS_AREAS: 30, MAX_DOMAIN_OBJECTS: 100, MAX_PROCESSES: 100, MAX_CAPABILITIES: 100, MAX_WARNINGS: 100, MAX_QUESTIONS: 50, MAX_ARCHITECT_DECISIONS: 200, MAX_FIELDS_PER_RESOURCE: 50, MAX_PLAN_BYTES: 512_000, MAX_SNAPSHOT_ITEMS_PER_TYPE: 100 });
export const ORGANIZATION_ANALYSIS_SCHEMA_VERSION = '1.0.0';

const PLAN_KEYS = new Set(['planId', 'planVersion', 'status', 'workspaceId', 'source', 'organizationProfile', 'industryAnalysis', 'businessAreas', 'domainObjects', 'processes', 'capabilities', 'proposedEntityTypes', 'proposedModules', 'proposedRelationships', 'proposedWorksets', 'proposedWidgets', 'proposedReports', 'architectDecisions', 'evolutionSummary', 'warnings', 'unresolvedQuestions', 'validation', 'provenance']);
const SNAPSHOT_KEYS = Object.freeze({
  entityTypes: ['typeId', 'code', 'name', 'description', 'category', 'status', 'schemaVersion', 'fields'],
  modules: ['moduleId', 'moduleCode', 'name', 'description', 'category', 'status', 'version', 'formSchema', 'displayConfig', 'capabilities', 'primaryEntityTypeId'],
  relationships: ['relationshipId', 'relationshipType', 'source', 'target'],
  worksets: ['worksetId', 'name', 'status', 'moduleIds'],
  widgets: ['widgetId', 'name', 'type', 'source', 'moduleId', 'moduleIds', 'status'],
  reports: ['reportId', 'name', 'status', 'version', 'dataSources'],
});

function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function array(value, label) { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); return value; }
function bounded(value, limit, label) { if (value.length > limit) throw new Error(`${label} exceeds limit ${limit}`); }
function bytes(value) { try { return new TextEncoder().encode(JSON.stringify(value)).length; } catch { throw new Error('Automat contract must be serializable'); } }

export function createPlanRef(kind, code) {
  if (!Object.values(PLAN_REF_KINDS).includes(kind)) throw new Error(`Unsupported plan reference kind: ${kind}`);
  if (!code || typeof code !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(code)) throw new Error('Plan reference code must be uppercase letters, digits, and underscores');
  return `${kind}:${code}`;
}

export function parsePlanRef(ref) {
  if (typeof ref !== 'string') throw new Error('Plan reference must be a string');
  const [kind, code, ...rest] = ref.split(':');
  if (rest.length || !Object.values(PLAN_REF_KINDS).includes(kind) || !/^[A-Z][A-Z0-9_]*$/.test(code || '')) throw new Error(`Invalid plan reference: ${ref}`);
  return Object.freeze({ kind, code });
}

export function createAutomatBuildPlan(value) {
  if (!plain(value)) throw new Error('AutomatBuildPlan must be a plain object');
  const unknown = Object.keys(value).filter((key) => !PLAN_KEYS.has(key));
  if (unknown.length) throw new Error(`AutomatBuildPlan contains unknown properties: ${unknown.join(', ')}`);
  if (!value.planId || !value.workspaceId) throw new Error('Plan identity is required');
  if (value.planVersion !== AUTOMAT_PLAN_VERSION) throw new Error('Unsupported AutomatBuildPlan version');
  if (!Object.values(AUTOMAT_PLAN_STATUSES).includes(value.status)) throw new Error('Invalid AutomatBuildPlan status');
  if (!plain(value.source) || !value.source.requestedBy || !value.source.requestId || !Array.isArray(value.source.agentExecutions) || value.source.agentExecutions.some((id) => typeof id !== 'string' || !id)) throw new Error('BuildPlan source provenance is required');
  if (!plain(value.provenance) || value.provenance.contractVersion !== AUTOMAT_PLAN_VERSION || !Array.isArray(value.provenance.generatedBy)) throw new Error('BuildPlan provenance is required');
  for (const contribution of value.provenance.generatedBy) {
    if (!plain(contribution) || !contribution.agentCode || !contribution.agentVersion || !contribution.requestId || !contribution.providerAdapter) throw new Error('Invalid BuildPlan agent provenance');
  }
  if (bytes(value) > AUTOMAT_BOUNDS.MAX_PLAN_BYTES) throw new Error('AutomatBuildPlan exceeds size limit');
  const limits = [['businessAreas', AUTOMAT_BOUNDS.MAX_BUSINESS_AREAS], ['domainObjects', AUTOMAT_BOUNDS.MAX_DOMAIN_OBJECTS], ['processes', AUTOMAT_BOUNDS.MAX_PROCESSES], ['capabilities', AUTOMAT_BOUNDS.MAX_CAPABILITIES], ['proposedEntityTypes', AUTOMAT_BOUNDS.MAX_ENTITY_TYPES], ['proposedModules', AUTOMAT_BOUNDS.MAX_MODULES], ['proposedRelationships', AUTOMAT_BOUNDS.MAX_RELATIONSHIPS], ['proposedWorksets', AUTOMAT_BOUNDS.MAX_WORKSETS], ['proposedWidgets', AUTOMAT_BOUNDS.MAX_WIDGETS], ['proposedReports', AUTOMAT_BOUNDS.MAX_REPORTS], ['architectDecisions', AUTOMAT_BOUNDS.MAX_ARCHITECT_DECISIONS], ['warnings', AUTOMAT_BOUNDS.MAX_WARNINGS], ['unresolvedQuestions', AUTOMAT_BOUNDS.MAX_QUESTIONS]];
  for (const [key, limit] of limits) bounded(array(value[key] || [], key), limit, key);
  return Object.freeze(structuredClone(value));
}

export function createWorkspaceConfigurationSnapshot({ workspaceId, entityTypes = [], modules = [], relationships = [], worksets = [], widgets = [], reports = [] }) {
  if (!workspaceId) throw new Error('Snapshot workspaceId is required');
  const collections = { entityTypes, modules, relationships, worksets, widgets, reports };
  for (const [key, values] of Object.entries(collections)) {
    array(values, key);
    bounded(values, AUTOMAT_BOUNDS.MAX_SNAPSHOT_ITEMS_PER_TYPE, key);
  }
  const summaries = Object.fromEntries(Object.entries(collections).map(([key, values]) => [key, values.map((item) => Object.fromEntries(SNAPSHOT_KEYS[key].filter((field) => item[field] !== undefined).map((field) => [field, structuredClone(item[field])]))).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))]));
  return Object.freeze({ snapshotVersion: '1.0.0', workspaceId, ...summaries, bounds: Object.freeze({ maxItemsPerType: AUTOMAT_BOUNDS.MAX_SNAPSHOT_ITEMS_PER_TYPE }) });
}

export function validateOrganizationAnalysisInput(input) {
  if (!plain(input)) throw new Error('Organization analysis input must be a plain object');
  const allowed = new Set(['schemaVersion', 'workspaceId', 'organizationName', 'description', 'industry', 'country', 'size', 'employeeCount', 'locations', 'facilities', 'assets', 'services', 'userDescription', 'existingConfiguration']);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Organization analysis input contains unknown properties: ${unknown.join(', ')}`);
  if (input.schemaVersion !== ORGANIZATION_ANALYSIS_SCHEMA_VERSION || !input.workspaceId || !input.organizationName) throw new Error('Organization analysis identity/version is required');
  if (input.userDescription && input.userDescription.length > 10_000) throw new Error('Organization description exceeds limit');
  return true;
}

export function validateOrganizationAnalysisOutput(output) {
  if (!plain(output)) throw new Error('Organization analysis output must be a plain object');
  const allowed = new Set(['schemaVersion', 'organizationProfile', 'industryAnalysis', 'businessAreas', 'domainObjects', 'processes', 'capabilities', 'missingInformation', 'warnings', 'confidence']);
  const unknown = Object.keys(output).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Organization analysis output contains unknown properties: ${unknown.join(', ')}`);
  if (output.schemaVersion !== ORGANIZATION_ANALYSIS_SCHEMA_VERSION) throw new Error('Unsupported organization analysis output version');
  for (const key of ['businessAreas', 'domainObjects', 'processes', 'capabilities', 'missingInformation', 'warnings']) array(output[key] || [], key);
  if (output.confidence !== undefined && (typeof output.confidence !== 'number' || output.confidence < 0 || output.confidence > 1)) throw new Error('Confidence must be between 0 and 1');
  return true;
}
