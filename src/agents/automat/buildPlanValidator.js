import { validateFieldDefinitions, ENTITY_FIELD_TYPES } from '../../core/data/entityType.js';
import { validateAnalyticsDefinition } from '../../core/analytics/analyticsDefinition.js';
import { validateWidgetQuery } from '../../core/workspace/widgetDefinition.js';
import { validateFormSchema } from '../../modules/forms/formSchemaValidator.js';
import { validateModuleCode } from '../../modules/module.js';
import { AUTOMAT_BOUNDS, PLAN_OPERATION_CLASSIFICATIONS, PLAN_REF_KINDS, createAutomatBuildPlan, parsePlanRef } from './automatContracts.js';

export const BUILD_PLAN_VALIDATION_STATUSES = Object.freeze({ VALID: 'VALID', VALID_WITH_WARNINGS: 'VALID_WITH_WARNINGS', INVALID: 'INVALID' });
export const BUILD_PLAN_ISSUE_SEVERITIES = Object.freeze({ ERROR: 'ERROR', WARNING: 'WARNING' });
export const SUPPORTED_MODULE_CAPABILITIES = Object.freeze(['records', 'entities', 'relationships', 'worksets', 'widgets', 'reports', 'ledger', 'sharing']);
const UNSAFE_KEYS = new Set(['collectionPath', 'rawQuery', 'script', 'executable', 'jsx', 'componentCode']);
const RESOURCE_GROUPS = [
  ['proposedEntityTypes', PLAN_REF_KINDS.ENTITY_TYPE], ['proposedModules', PLAN_REF_KINDS.MODULE], ['proposedRelationships', PLAN_REF_KINDS.RELATIONSHIP],
  ['proposedWorksets', PLAN_REF_KINDS.WORKSET], ['proposedWidgets', PLAN_REF_KINDS.WIDGET], ['proposedReports', PLAN_REF_KINDS.REPORT],
];
const RESOURCE_KEYS = Object.freeze({
  proposedEntityTypes: new Set(['ref', 'code', 'name', 'description', 'fields']),
  proposedModules: new Set(['ref', 'moduleCode', 'name', 'description', 'category', 'businessAreaRef', 'processRef', 'recordType', 'capabilities', 'formSchema', 'primaryEntityTypeRef', 'lifecycle', 'ledgerRequirements', 'rationale']),
  proposedRelationships: new Set(['ref', 'sourceRef', 'targetRef', 'relationshipType', 'rationale']),
  proposedWorksets: new Set(['ref', 'name', 'description', 'moduleRefs', 'rationale']),
  proposedWidgets: new Set(['ref', 'name', 'moduleRefs', 'definition', 'rationale']),
  proposedReports: new Set(['ref', 'name', 'definition', 'rationale']),
});

function issue(code, path, message, relatedRef = null, severity = BUILD_PLAN_ISSUE_SEVERITIES.ERROR) { return { code, severity, path, message, relatedRef }; }
function sameFields(left = [], right = []) { return JSON.stringify(left.map(({ key, type, required, entityTypeId }) => ({ key, type, required: !!required, entityTypeId: entityTypeId || null }))) === JSON.stringify(right.map(({ key, type, required, entityTypeId }) => ({ key, type, required: !!required, entityTypeId: entityTypeId || null }))); }
function sameSet(left = [], right = []) { return left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]); }
function validateSafeData(value, path, issues, depth = 0) {
  if (depth > 12) { issues.push(issue('DEPTH_LIMIT_EXCEEDED', path, 'Plan nesting exceeds the maximum depth')); return; }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') { issues.push(issue('UNSAFE_CONFIGURATION', path, 'Executable or non-serializable values are not allowed')); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) issues.push(issue('UNSAFE_CONFIGURATION', `${path}.${key}`, `Unsafe configuration key: ${key}`));
    validateSafeData(child, `${path}.${key}`, issues, depth + 1);
  }
}

function classify(plan, snapshot) {
  const classifications = [];
  for (const proposed of plan.proposedEntityTypes || []) {
    const existing = snapshot.entityTypes.find((item) => item.code === proposed.code);
    const operation = !existing ? PLAN_OPERATION_CLASSIFICATIONS.CREATE : sameFields(existing.fields, proposed.fields) ? PLAN_OPERATION_CLASSIFICATIONS.REUSE : PLAN_OPERATION_CLASSIFICATIONS.CONFLICT;
    classifications.push({ ref: proposed.ref, resourceType: 'ENTITY_TYPE', operation, existingResourceId: existing?.typeId || null });
  }
  for (const proposed of plan.proposedModules || []) {
    const existing = snapshot.modules.find((item) => item.moduleCode === proposed.moduleCode);
    const operation = !existing ? PLAN_OPERATION_CLASSIFICATIONS.CREATE : sameFields(existing.formSchema?.fields, proposed.formSchema?.fields) ? PLAN_OPERATION_CLASSIFICATIONS.REUSE : PLAN_OPERATION_CLASSIFICATIONS.CONFLICT;
    classifications.push({ ref: proposed.ref, resourceType: 'MODULE', operation, existingResourceId: existing?.moduleId || null });
  }
  const resolvedId = (ref) => classifications.find((item) => item.ref === ref && item.operation === PLAN_OPERATION_CLASSIFICATIONS.REUSE)?.existingResourceId || null;
  for (const proposed of plan.proposedRelationships || []) {
    const source = resolvedId(proposed.sourceRef);
    const target = resolvedId(proposed.targetRef);
    const existing = snapshot.relationships.find((item) => item.relationshipType === proposed.relationshipType && item.source === source && item.target === target);
    classifications.push({ ref: proposed.ref, resourceType: 'RELATIONSHIP', operation: existing ? PLAN_OPERATION_CLASSIFICATIONS.REUSE : PLAN_OPERATION_CLASSIFICATIONS.CREATE, existingResourceId: existing?.relationshipId || null });
  }
  for (const proposed of plan.proposedWorksets || []) {
    const existing = snapshot.worksets.find((item) => item.name === proposed.name);
    const moduleIds = (proposed.moduleRefs || []).map(resolvedId).filter(Boolean);
    const compatible = existing && moduleIds.length === (proposed.moduleRefs || []).length && sameSet(existing.moduleIds || [], moduleIds);
    classifications.push({ ref: proposed.ref, resourceType: 'WORKSET', operation: !existing ? PLAN_OPERATION_CLASSIFICATIONS.CREATE : compatible ? PLAN_OPERATION_CLASSIFICATIONS.REUSE : PLAN_OPERATION_CLASSIFICATIONS.CONFLICT, existingResourceId: existing?.worksetId || null });
  }
  for (const proposed of plan.proposedWidgets || []) {
    const existing = snapshot.widgets.find((item) => item.name === proposed.name);
    const moduleIds = (proposed.moduleRefs || []).map(resolvedId).filter(Boolean);
    const compatible = existing && existing.source === proposed.definition?.source && moduleIds.length === (proposed.moduleRefs || []).length && sameSet(existing.moduleIds || (existing.moduleId ? [existing.moduleId] : []), moduleIds);
    classifications.push({ ref: proposed.ref, resourceType: 'WIDGET', operation: !existing ? PLAN_OPERATION_CLASSIFICATIONS.CREATE : compatible ? PLAN_OPERATION_CLASSIFICATIONS.REUSE : PLAN_OPERATION_CLASSIFICATIONS.CONFLICT, existingResourceId: existing?.widgetId || null });
  }
  for (const proposed of plan.proposedReports || []) {
    const existing = snapshot.reports.find((item) => item.name === proposed.name);
    const sourceIds = (proposed.definition?.dataSources || []).map((source) => resolvedId(source.moduleRef || source.moduleId)).filter(Boolean);
    const existingIds = (existing?.dataSources || []).map((source) => source.moduleId).filter(Boolean);
    const compatible = existing && sourceIds.length === (proposed.definition?.dataSources || []).length && sameSet(existingIds, sourceIds);
    classifications.push({ ref: proposed.ref, resourceType: 'REPORT', operation: !existing ? PLAN_OPERATION_CLASSIFICATIONS.CREATE : compatible ? PLAN_OPERATION_CLASSIFICATIONS.REUSE : PLAN_OPERATION_CLASSIFICATIONS.CONFLICT, existingResourceId: existing?.reportId || null });
  }
  return classifications;
}

export function validateAutomatBuildPlan(value, snapshot) {
  const issues = [];
  let plan;
  try { plan = createAutomatBuildPlan(value); } catch (error) { return { status: BUILD_PLAN_VALIDATION_STATUSES.INVALID, issues: [issue('INVALID_CONTRACT', '$', error.message)], classifications: [] }; }
  if (!snapshot || snapshot.workspaceId !== plan.workspaceId) issues.push(issue('WORKSPACE_MISMATCH', 'workspaceId', 'BuildPlan and Workspace snapshot must have the same workspaceId'));
  validateSafeData(plan, '$', issues);
  const refs = new Map();
  for (const [key, expectedKind] of RESOURCE_GROUPS) {
    for (const [index, resource] of (plan[key] || []).entries()) {
      const path = `${key}[${index}].ref`;
      const unknownKeys = Object.keys(resource || {}).filter((property) => !RESOURCE_KEYS[key].has(property));
      if (unknownKeys.length) issues.push(issue('UNKNOWN_PROPERTY', `${key}[${index}]`, `Unknown properties: ${unknownKeys.join(', ')}`, resource?.ref));
      try {
        const parsed = parsePlanRef(resource.ref);
        if (parsed.kind !== expectedKind) issues.push(issue('INVALID_REFERENCE_KIND', path, `Expected ${expectedKind} reference`, resource.ref));
        if (refs.has(resource.ref)) issues.push(issue('DUPLICATE_PLAN_REFERENCE', path, `Duplicate plan reference: ${resource.ref}`, resource.ref));
        else refs.set(resource.ref, { key, index, resource });
      } catch (error) { issues.push(issue('INVALID_PLAN_REFERENCE', path, error.message, resource.ref)); }
    }
  }
  const entityCodes = new Set();
  for (const [index, entityType] of (plan.proposedEntityTypes || []).entries()) {
    if (entityCodes.has(entityType.code)) issues.push(issue('DUPLICATE_ENTITY_TYPE_CODE', `proposedEntityTypes[${index}].code`, `Duplicate Entity Type code: ${entityType.code}`, entityType.ref));
    entityCodes.add(entityType.code);
    const result = validateFieldDefinitions(entityType.fields || [], { allowedTypes: ENTITY_FIELD_TYPES });
    result.errors.forEach((message) => issues.push(issue('INVALID_ENTITY_TYPE', `proposedEntityTypes[${index}].fields`, message, entityType.ref)));
    for (const [fieldIndex, field] of (entityType.fields || []).entries()) if (field.type === 'entity-reference' && !refs.has(field.entityTypeId) && !snapshot?.entityTypes?.some((item) => item.typeId === field.entityTypeId || `entityType:${item.code}` === field.entityTypeId)) issues.push(issue('BROKEN_REFERENCE', `proposedEntityTypes[${index}].fields[${fieldIndex}].entityTypeId`, `Unknown Entity Type reference: ${field.entityTypeId}`, field.entityTypeId));
    if ((entityType.fields || []).length > AUTOMAT_BOUNDS.MAX_FIELDS_PER_RESOURCE) issues.push(issue('RESOURCE_LIMIT_EXCEEDED', `proposedEntityTypes[${index}].fields`, 'Entity Type field limit exceeded', entityType.ref));
  }
  const moduleCodes = new Set();
  for (const [index, module] of (plan.proposedModules || []).entries()) {
    const base = `proposedModules[${index}]`;
    if (moduleCodes.has(module.moduleCode)) issues.push(issue('DUPLICATE_MODULE_CODE', `${base}.moduleCode`, `Duplicate Module code: ${module.moduleCode}`, module.ref));
    moduleCodes.add(module.moduleCode);
    validateModuleCode(module.moduleCode).errors.forEach((message) => issues.push(issue('INVALID_MODULE_CODE', `${base}.moduleCode`, message, module.ref)));
    const formResult = validateFormSchema(module.formSchema);
    formResult.errors.forEach((message) => issues.push(issue('INVALID_FORM_SCHEMA', `${base}.formSchema`, message, module.ref)));
    if ((module.formSchema?.fields || []).length > AUTOMAT_BOUNDS.MAX_FIELDS_PER_RESOURCE) issues.push(issue('RESOURCE_LIMIT_EXCEEDED', `${base}.formSchema.fields`, 'Module field limit exceeded', module.ref));
    for (const [fieldIndex, field] of (module.formSchema?.fields || []).entries()) {
      if (field.type === 'entity-reference' && !refs.has(field.entityTypeId) && !snapshot?.entityTypes?.some((item) => item.typeId === field.entityTypeId || `entityType:${item.code}` === field.entityTypeId)) issues.push(issue('BROKEN_REFERENCE', `${base}.formSchema.fields[${fieldIndex}].entityTypeId`, `Unknown Entity Type reference: ${field.entityTypeId}`, field.entityTypeId));
    }
    for (const capability of module.capabilities || []) if (!SUPPORTED_MODULE_CAPABILITIES.includes(capability)) issues.push(issue('UNSUPPORTED_CAPABILITY', `${base}.capabilities`, `Unsupported Module capability: ${capability}`, module.ref));
  }
  const hasModule = (ref) => refs.get(ref)?.key === 'proposedModules' || snapshot?.modules?.some((item) => item.moduleId === ref || `module:${item.moduleCode}` === ref);
  for (const [index, workset] of (plan.proposedWorksets || []).entries()) for (const ref of workset.moduleRefs || []) if (!hasModule(ref)) issues.push(issue('BROKEN_REFERENCE', `proposedWorksets[${index}].moduleRefs`, `Unknown Module reference: ${ref}`, ref));
  for (const [index, widget] of (plan.proposedWidgets || []).entries()) {
    for (const ref of widget.moduleRefs || []) if (!hasModule(ref)) issues.push(issue('BROKEN_REFERENCE', `proposedWidgets[${index}].moduleRefs`, `Unknown Module reference: ${ref}`, ref));
    try { validateWidgetQuery({ ...widget.definition, moduleIds: widget.moduleRefs || [] }); } catch (error) { issues.push(issue('INVALID_WIDGET', `proposedWidgets[${index}].definition`, error.message, widget.ref)); }
  }
  for (const [index, report] of (plan.proposedReports || []).entries()) {
    const sources = (report.definition?.dataSources || []).map((source) => ({ ...source, moduleId: source.moduleRef || source.moduleId }));
    for (const source of sources) if (source.sourceType === 'RECORDS' && !hasModule(source.moduleId)) issues.push(issue('BROKEN_REFERENCE', `proposedReports[${index}].definition.dataSources`, `Unknown Module reference: ${source.moduleId}`, source.moduleId));
    try { validateAnalyticsDefinition({ ...report.definition, dataSources: sources }); } catch (error) { issues.push(issue('INVALID_REPORT', `proposedReports[${index}].definition`, error.message, report.ref)); }
  }
  for (const [index, relationship] of (plan.proposedRelationships || []).entries()) for (const key of ['sourceRef', 'targetRef']) if (!refs.has(relationship[key])) issues.push(issue('BROKEN_REFERENCE', `proposedRelationships[${index}].${key}`, `Unknown plan reference: ${relationship[key]}`, relationship[key]));
  const classifications = snapshot ? classify(plan, snapshot) : [];
  for (const item of classifications.filter((entry) => entry.operation === PLAN_OPERATION_CLASSIFICATIONS.CONFLICT)) issues.push(issue('RESOURCE_CONFLICT', '$', `Existing resource conflicts with ${item.ref}`, item.ref));
  const hasErrors = issues.some((item) => item.severity === BUILD_PLAN_ISSUE_SEVERITIES.ERROR);
  const hasWarnings = issues.some((item) => item.severity === BUILD_PLAN_ISSUE_SEVERITIES.WARNING);
  return { status: hasErrors ? BUILD_PLAN_VALIDATION_STATUSES.INVALID : hasWarnings ? BUILD_PLAN_VALIDATION_STATUSES.VALID_WITH_WARNINGS : BUILD_PLAN_VALIDATION_STATUSES.VALID, issues, classifications };
}
