import { describe, expect, it } from 'vitest';
import { FIELD_TYPES } from '../../../core/data/entityType.js';
import { addDesignerField, createModuleDesignerDraft, designerFieldTypeOptions, importProposedSchemaToDesignerDraft, isModuleDesignerDirty, moveDesignerField, removeDesignerField, serializeModuleDesignerDraft, toggleListField, updateDesignerField, validateModuleDesignerDraft } from './model.js';

const types = [{ typeId: 'core:vehicle', code: 'VEHICLE', name: 'Vehicle', category: 'CORE', workspaceId: 'workspace-1' }, { typeId: 'room-type', code: 'ROOM', name: 'Room', category: 'DOMAIN', workspaceId: 'workspace-1' }];
const validModule = { moduleId: 'module-1', moduleCode: 'INSPECTION', name: 'Inspection', description: '', category: 'Operations', status: 'ACTIVE', version: 1, formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'vehicle', label: 'Vehicle', type: 'entity-reference', entityTypeId: 'core:vehicle', required: true }, { key: 'result', label: 'Result', type: 'select', options: ['PASS', 'FAIL'], required: true }] }, displayConfig: { primaryField: 'vehicle', listFields: ['vehicle', 'result'] } };

describe('Module Designer draft model', () => {
  it('loads existing manual or Automat Module schema without a parallel format', () => {
    const draft = createModuleDesignerDraft(validModule);
    expect(draft.moduleCode).toBe('INSPECTION');
    expect(draft.fields.map((field) => field.key)).toEqual(['vehicle', 'result']);
    expect(draft.listFields).toEqual(['vehicle', 'result']);
    expect(serializeModuleDesignerDraft(draft).formSchema).toEqual(validModule.formSchema);
  });

  it('derives the palette from the operational Field Registry', () => {
    expect(designerFieldTypeOptions().map((item) => item.value)).toEqual(expect.arrayContaining(Object.values(FIELD_TYPES)));
  });

  it('adds, edits, removes, and reorders fields deterministically', () => {
    let draft = createModuleDesignerDraft();
    draft = addDesignerField(draft, FIELD_TYPES.TEXT);
    draft = updateDesignerField(draft, draft.fields[0]._designerId, { label: 'Name', key: 'name' });
    draft = addDesignerField(draft, FIELD_TYPES.DATE);
    draft = updateDesignerField(draft, draft.fields[1]._designerId, { label: 'Date', key: 'date' });
    draft = moveDesignerField(draft, draft.fields[1]._designerId, -1);
    expect(draft.fields.map((field) => field.key)).toEqual(['date', 'name']);
    draft = removeDesignerField(draft, draft.fields[0]._designerId);
    expect(draft.fields.map((field) => field.key)).toEqual(['name']);
  });

  it('rejects duplicate field keys and unsupported field types', () => {
    const draft = createModuleDesignerDraft({ ...validModule, formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'same', label: 'A', type: 'text' }, { key: 'same', label: 'B', type: 'text' }, { key: 'custom', label: 'Custom', type: 'remote-widget' }] } });
    const result = validateModuleDesignerDraft(draft, types);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Duplicate|Unsupported/);
  });

  it('rejects executable and arbitrary Firestore configuration', () => {
    const draft = createModuleDesignerDraft(validModule);
    draft.fields[0].script = 'run()';
    draft.fields[1].collectionPath = 'workspaces/x/records';
    expect(validateModuleDesignerDraft(draft, types).errors.join(' ')).toMatch(/Unsafe/);
  });

  it('validates bounded non-empty unique select options', () => {
    let draft = createModuleDesignerDraft(validModule);
    const id = draft.fields[1]._designerId;
    draft = updateDesignerField(draft, id, { optionsText: '' });
    expect(validateModuleDesignerDraft(draft, types).errors.join(' ')).toMatch(/requires options/);
    draft = updateDesignerField(draft, id, { optionsText: 'OPEN\nopen' });
    expect(validateModuleDesignerDraft(draft, types).errors.join(' ')).toMatch(/duplicate options/);
    draft = updateDesignerField(draft, id, { optionsText: 'OPEN | Open\nCLOSED | Closed' });
    expect(validateModuleDesignerDraft(draft, types).valid).toBe(true);
  });

  it('accepts Core and Domain Entity Types and rejects unknown/cross-Workspace references', () => {
    let draft = createModuleDesignerDraft(validModule);
    expect(validateModuleDesignerDraft(draft, types).valid).toBe(true);
    draft = updateDesignerField(draft, draft.fields[0]._designerId, { entityTypeId: 'room-type' });
    expect(validateModuleDesignerDraft(draft, types).valid).toBe(true);
    draft = updateDesignerField(draft, draft.fields[0]._designerId, { entityTypeId: 'other-workspace-type' });
    expect(validateModuleDesignerDraft(draft, types).errors.join(' ')).toMatch(/invalid Entity Type/);
  });

  it('validates and serializes existing listFields configuration', () => {
    let draft = createModuleDesignerDraft(validModule);
    draft = toggleListField(draft, 'result');
    expect(serializeModuleDesignerDraft(draft).displayConfig.listFields).toEqual(['vehicle']);
    draft = { ...draft, listFields: ['missing'] };
    expect(validateModuleDesignerDraft(draft, types).errors).toContain('Record List contains an unknown field');
  });

  it('tracks dirty state separately from canonical persisted state', () => {
    const initial = createModuleDesignerDraft(validModule);
    expect(isModuleDesignerDirty(initial, initial)).toBe(false);
    const changed = { ...initial, name: 'Changed' };
    expect(isModuleDesignerDirty(changed, initial)).toBe(true);
  });

  it('uses the same import seam for future AI/photo/PDF proposed schemas', () => {
    const draft = importProposedSchemaToDesignerDraft(validModule);
    expect(serializeModuleDesignerDraft(draft).formSchema).toEqual(validModule.formSchema);
  });
});
