import { FIELD_TYPES } from '../../../core/data/entityType.js';
import { validateModuleCode } from '../../../modules/module.js';
import { listRegisteredFieldTypes } from '../../../modules/forms/fieldRegistry.js';
import { validateFormSchema } from '../../../modules/forms/formSchemaValidator.js';

export const DESIGNER_LIMITS = Object.freeze({ MAX_FIELDS: 50, MAX_OPTIONS: 50, MAX_LIST_FIELDS: 8, MAX_NAME_LENGTH: 120, MAX_CODE_LENGTH: 80, MAX_DESCRIPTION_LENGTH: 1000, MAX_CATEGORY_LENGTH: 120, MAX_LABEL_LENGTH: 160, MAX_HELP_TEXT_LENGTH: 500, MAX_PLACEHOLDER_LENGTH: 200, MAX_SCHEMA_BYTES: 64_000, MAX_CONFIG_DEPTH: 8 });
const UNSAFE_KEYS = new Set(['collectionPath', 'firestorePath', 'rawQuery', 'script', 'scriptUrl', 'moduleUrl', 'executable', 'expression', 'eval', 'function', 'componentCode', 'jsx']);
const FIELD_PROPERTY_KEYS = new Set(['key', 'label', 'type', 'required', 'placeholder', 'helpText', 'options', 'entityTypeId', 'min', 'max', 'minLength', 'maxLength']);
const FIELD_TYPE_LABELS = Object.freeze({ text: 'Text', textarea: 'Long Text', number: 'Number', date: 'Date', datetime: 'Date & Time', 'date-range': 'Date Range', 'datetime-range': 'Date & Time Range', boolean: 'Yes / No', select: 'Select', email: 'Email', phone: 'Phone', url: 'URL', 'entity-reference': 'Entity Reference', 'file-reference': 'File Reference' });
let designerSequence = 0;
const nextDesignerId = () => `designer-field-${++designerSequence}`;
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

export function designerFieldTypeOptions() {
  return listRegisteredFieldTypes().map((value) => Object.freeze({ value, label: FIELD_TYPE_LABELS[value] || value }));
}

export function toFieldKey(label) {
  const words = String(label || '').trim().replace(/[^A-Za-z0-9]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const value = words.map((word, index) => index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1)).join('');
  return /^[A-Za-z]/.test(value) ? value : `field${value}`;
}

function optionText(option) {
  return typeof option === 'object' && option !== null ? `${option.value} | ${option.label}` : String(option);
}
function parseOptions(optionsText) {
  return String(optionsText || '').split('\n').map((item) => item.trim()).filter(Boolean).map((item) => {
    const separator = item.indexOf('|');
    return separator > 0 ? { value: item.slice(0, separator).trim(), label: item.slice(separator + 1).trim() } : item;
  });
}
function toDesignerField(field = {}) {
  return { _designerId: nextDesignerId(), key: field.key || '', label: field.label || '', type: field.type || FIELD_TYPES.TEXT, required: !!field.required, placeholder: field.placeholder || '', helpText: field.helpText || '', optionsText: Array.isArray(field.options) ? field.options.map(optionText).join('\n') : '', entityTypeId: field.entityTypeId || '', min: field.min ?? '', max: field.max ?? '', minLength: field.minLength ?? '', maxLength: field.maxLength ?? '' };
}

export function createModuleDesignerDraft(moduleDefinition = null) {
  const fields = (moduleDefinition?.formSchema?.fields || []).map(toDesignerField);
  return Object.freeze({
    moduleId: moduleDefinition?.moduleId || null,
    moduleCode: moduleDefinition?.moduleCode || '',
    name: moduleDefinition?.name || '',
    description: moduleDefinition?.description || '',
    category: moduleDefinition?.category || '',
    status: moduleDefinition?.status || 'DRAFT',
    version: moduleDefinition?.version || 1,
    fields,
    listFields: [...(moduleDefinition?.displayConfig?.listFields || [])].filter((key) => fields.some((field) => field.key === key)),
    primaryField: moduleDefinition?.displayConfig?.primaryField || fields[0]?.key || '',
  });
}

export function addDesignerField(draft, type = FIELD_TYPES.TEXT) {
  if (draft.fields.length >= DESIGNER_LIMITS.MAX_FIELDS) return draft;
  return { ...draft, fields: [...draft.fields, toDesignerField({ type })] };
}
export function updateDesignerField(draft, designerId, changes) {
  const previous = draft.fields.find((field) => field._designerId === designerId);
  const fields = draft.fields.map((field) => field._designerId === designerId ? { ...field, ...changes } : field);
  const listFields = changes.key !== undefined && previous ? draft.listFields.map((key) => key === previous.key ? changes.key : key) : draft.listFields;
  return { ...draft, fields, listFields, primaryField: changes.key !== undefined && previous && draft.primaryField === previous.key ? changes.key : draft.primaryField };
}
export function removeDesignerField(draft, designerId) {
  const removed = draft.fields.find((field) => field._designerId === designerId);
  const fields = draft.fields.filter((field) => field._designerId !== designerId);
  return { ...draft, fields, listFields: draft.listFields.filter((key) => key !== removed?.key), primaryField: draft.primaryField === removed?.key ? fields[0]?.key || '' : draft.primaryField };
}
export function moveDesignerField(draft, designerId, direction) {
  const index = draft.fields.findIndex((field) => field._designerId === designerId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draft.fields.length) return draft;
  const fields = [...draft.fields];
  [fields[index], fields[target]] = [fields[target], fields[index]];
  return { ...draft, fields };
}
export function toggleListField(draft, key) {
  if (draft.listFields.includes(key)) return { ...draft, listFields: draft.listFields.filter((item) => item !== key) };
  if (draft.listFields.length >= DESIGNER_LIMITS.MAX_LIST_FIELDS) return draft;
  return { ...draft, listFields: [...draft.listFields, key] };
}

function safe(value, depth = 0) {
  if (depth > DESIGNER_LIMITS.MAX_CONFIG_DEPTH) throw new Error('Designer configuration exceeds depth limit');
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new Error('Designer configuration cannot contain executable values');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) throw new Error(`Unsafe Designer configuration key: ${key}`);
    safe(child, depth + 1);
  }
}
function canonicalField(field) {
  const value = { key: field.key.trim(), label: field.label.trim(), type: field.type, required: !!field.required };
  if (field.placeholder.trim()) value.placeholder = field.placeholder.trim();
  if (field.helpText.trim()) value.helpText = field.helpText.trim();
  if (field.type === FIELD_TYPES.SELECT) value.options = parseOptions(field.optionsText);
  if (field.type === FIELD_TYPES.ENTITY_REFERENCE) value.entityTypeId = field.entityTypeId;
  if (field.type === FIELD_TYPES.NUMBER) {
    if (field.min !== '') value.min = Number(field.min);
    if (field.max !== '') value.max = Number(field.max);
  }
  if ([FIELD_TYPES.TEXT, FIELD_TYPES.TEXTAREA].includes(field.type)) {
    if (field.minLength !== '') value.minLength = Number(field.minLength);
    if (field.maxLength !== '') value.maxLength = Number(field.maxLength);
  }
  return value;
}

export function serializeModuleDesignerDraft(draft) {
  const fields = draft.fields.map(canonicalField);
  return Object.freeze({ name: draft.name.trim(), moduleCode: draft.moduleCode.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'), description: draft.description.trim(), category: draft.category.trim(), formSchema: { schemaVersion: '1.0.0', fields }, displayConfig: { primaryField: draft.primaryField || fields[0]?.key || '', listFields: draft.listFields.filter((key) => fields.some((field) => field.key === key)).slice(0, DESIGNER_LIMITS.MAX_LIST_FIELDS) } });
}

export function validateModuleDesignerDraft(draft, entityTypes = []) {
  const errors = [];
  try { safe(draft); } catch (error) { errors.push(error.message); }
  if (!draft.name.trim()) errors.push('Module name is required');
  else if (draft.name.trim().length > DESIGNER_LIMITS.MAX_NAME_LENGTH) errors.push(`Module name exceeds ${DESIGNER_LIMITS.MAX_NAME_LENGTH} characters`);
  const code = draft.moduleCode.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  errors.push(...validateModuleCode(code).errors);
  if (code.length > DESIGNER_LIMITS.MAX_CODE_LENGTH) errors.push(`Module code exceeds ${DESIGNER_LIMITS.MAX_CODE_LENGTH} characters`);
  if (draft.description.length > DESIGNER_LIMITS.MAX_DESCRIPTION_LENGTH) errors.push(`Description exceeds ${DESIGNER_LIMITS.MAX_DESCRIPTION_LENGTH} characters`);
  if (draft.category.length > DESIGNER_LIMITS.MAX_CATEGORY_LENGTH) errors.push(`Category exceeds ${DESIGNER_LIMITS.MAX_CATEGORY_LENGTH} characters`);
  if (!draft.fields.length) errors.push('At least one field is required');
  if (draft.fields.length > DESIGNER_LIMITS.MAX_FIELDS) errors.push(`Form exceeds ${DESIGNER_LIMITS.MAX_FIELDS} fields`);
  if (draft.listFields.some((key) => !draft.fields.some((field) => field.key === key))) errors.push('Record List contains an unknown field');
  if (draft.listFields.length > DESIGNER_LIMITS.MAX_LIST_FIELDS) errors.push(`Record List exceeds ${DESIGNER_LIMITS.MAX_LIST_FIELDS} fields`);
  const supportedTypes = new Set(listRegisteredFieldTypes());
  const knownEntityTypes = new Set(entityTypes.flatMap((item) => [item.typeId, `entityType:${item.code}`]));
  for (const field of draft.fields) {
    if (!supportedTypes.has(field.type)) errors.push(`Unsupported field type: ${field.type}`);
    if (field.label.trim().length > DESIGNER_LIMITS.MAX_LABEL_LENGTH) errors.push(`Field label exceeds ${DESIGNER_LIMITS.MAX_LABEL_LENGTH} characters`);
    if (field.helpText.length > DESIGNER_LIMITS.MAX_HELP_TEXT_LENGTH) errors.push(`Help text exceeds ${DESIGNER_LIMITS.MAX_HELP_TEXT_LENGTH} characters`);
    if (field.placeholder.length > DESIGNER_LIMITS.MAX_PLACEHOLDER_LENGTH) errors.push(`Placeholder exceeds ${DESIGNER_LIMITS.MAX_PLACEHOLDER_LENGTH} characters`);
    if (field.type === FIELD_TYPES.SELECT) {
      const options = parseOptions(field.optionsText);
      if (!options.length) errors.push(`Select field "${field.key || field.label}" requires options`);
      if (options.length > DESIGNER_LIMITS.MAX_OPTIONS) errors.push(`Select field "${field.key || field.label}" exceeds ${DESIGNER_LIMITS.MAX_OPTIONS} options`);
      const values = options.map((option) => String(typeof option === 'object' ? option.value : option).toLowerCase());
      if (new Set(values).size !== values.length) errors.push(`Select field "${field.key || field.label}" contains duplicate options`);
    }
    if (field.type === FIELD_TYPES.ENTITY_REFERENCE && !knownEntityTypes.has(field.entityTypeId)) errors.push(`Entity reference field "${field.key || field.label}" has an invalid Entity Type`);
    for (const key of Object.keys(field)) if (!key.startsWith('_') && !['optionsText'].includes(key) && !FIELD_PROPERTY_KEYS.has(key)) errors.push(`Unsafe or unsupported field property: ${key}`);
  }
  let payload = null;
  try {
    payload = serializeModuleDesignerDraft(draft);
    const schemaResult = validateFormSchema(payload.formSchema);
    errors.push(...schemaResult.errors);
    if (bytes(payload.formSchema) > DESIGNER_LIMITS.MAX_SCHEMA_BYTES) errors.push(`Form schema exceeds ${DESIGNER_LIMITS.MAX_SCHEMA_BYTES} bytes`);
    if (payload.displayConfig.listFields.some((key) => !payload.formSchema.fields.some((field) => field.key === key))) errors.push('Record List contains an unknown field');
  } catch (error) { errors.push(error.message); }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze([...new Set(errors)]), payload });
}

export function moduleDesignerDraftFingerprint(draft) {
  const payload = serializeModuleDesignerDraft(draft);
  return JSON.stringify(payload);
}

export function isModuleDesignerDirty(draft, initialDraft) {
  return moduleDesignerDraftFingerprint(draft) !== moduleDesignerDraftFingerprint(initialDraft);
}

export function importProposedSchemaToDesignerDraft(proposal) {
  return createModuleDesignerDraft(proposal);
}
