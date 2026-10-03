import { CAPABILITY_CONTRACT_VERSION, CAPABILITY_DEFINITION_STATUSES, CAPABILITY_SOURCE_KINDS, createCapabilityDefinition } from './capabilityContracts.js';

export const CALENDAR_ENGINE_ID = 'calendar';
export const CALENDAR_DEFINITION_TYPE = 'CalendarDefinitionV1';
const MAPPING_KEYS = new Set(['titleField', 'startField', 'endField', 'resourceField']);
const TIME_TYPES = new Set(['date', 'datetime', 'date-range']);
const TITLE_TYPES = new Set(['text', 'textarea', 'select', 'email', 'phone', 'entity-reference']);

export function createCalendarDefinitionV1({ definitionId, workspaceId, sourceRef, mapping, status = CAPABILITY_DEFINITION_STATUSES.DRAFT }) {
  return createCapabilityDefinition({ definitionId, definitionVersion: '1.0.0', engineId: CALENDAR_ENGINE_ID, contractVersion: CAPABILITY_CONTRACT_VERSION, workspaceId, source: { kind: CAPABILITY_SOURCE_KINDS.MODULE, ref: sourceRef, workspaceId }, configuration: { definitionType: CALENDAR_DEFINITION_TYPE, mapping: structuredClone(mapping) }, status });
}

export function validateCalendarDefinitionV1(definition, { source }) {
  const issues = [];
  if (definition.configuration.definitionType !== CALENDAR_DEFINITION_TYPE) issues.push({ code: 'CALENDAR_DEFINITION_TYPE', message: `Calendar definitionType must be ${CALENDAR_DEFINITION_TYPE}` });
  const mapping = definition.configuration.mapping;
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return { valid: false, issues: [{ code: 'CALENDAR_MAPPING_REQUIRED', message: 'Calendar mapping is required' }] };
  const unknown = Object.keys(mapping).filter((key) => !MAPPING_KEYS.has(key));
  if (unknown.length) issues.push({ code: 'CALENDAR_MAPPING_UNKNOWN_KEY', message: `Unknown Calendar mapping keys: ${unknown.join(', ')}` });
  for (const key of ['titleField', 'startField']) if (!mapping[key] || typeof mapping[key] !== 'string') issues.push({ code: 'CALENDAR_MAPPING_REQUIRED', message: `${key} is required` });
  const fields = source.formSchema?.fields || [];
  const field = (key) => fields.find((item) => item.key === key);
  const title = field(mapping.titleField);
  const start = field(mapping.startField);
  const end = mapping.endField ? field(mapping.endField) : null;
  const resource = mapping.resourceField ? field(mapping.resourceField) : null;
  if (mapping.titleField && !title) issues.push({ code: 'UNKNOWN_FIELD', message: `Unknown titleField: ${mapping.titleField}` });
  else if (title && !TITLE_TYPES.has(title.type)) issues.push({ code: 'WRONG_FIELD_TYPE', message: 'titleField must be human-readable' });
  if (mapping.startField && !start) issues.push({ code: 'UNKNOWN_FIELD', message: `Unknown startField: ${mapping.startField}` });
  else if (start && !TIME_TYPES.has(start.type)) issues.push({ code: 'WRONG_FIELD_TYPE', message: 'startField must be date or datetime' });
  if (mapping.endField && !end) issues.push({ code: 'UNKNOWN_FIELD', message: `Unknown endField: ${mapping.endField}` });
  else if (end && !TIME_TYPES.has(end.type)) issues.push({ code: 'WRONG_FIELD_TYPE', message: 'endField must be date or datetime' });
  if (mapping.resourceField && !resource) issues.push({ code: 'UNKNOWN_FIELD', message: `Unknown resourceField: ${mapping.resourceField}` });
  else if (resource && resource.type !== 'entity-reference') issues.push({ code: 'WRONG_FIELD_TYPE', message: 'resourceField must be an EntityReference' });
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}
