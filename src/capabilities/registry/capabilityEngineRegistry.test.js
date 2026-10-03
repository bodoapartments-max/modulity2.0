import { describe, expect, it } from 'vitest';
import { createWorkspaceConfigurationSnapshot } from '../../agents/automat/automatContracts.js';
import { createWorkspaceSemanticModel } from '../../agents/planning/workspaceArchitect.js';
import { createCalendarDefinitionV1, validateCalendarDefinitionV1 } from '../../engines/calendar/validation/calendarDefinitionV1.js';
import { CAPABILITY_AVAILABILITY, CAPABILITY_CONTRACT_VERSION, CAPABILITY_DEFINITION_STATUSES, CAPABILITY_MODES, CAPABILITY_SOURCE_KINDS, assertCapabilityConfigurationSafe, createCapabilityBinding, createCapabilityDefinition, createCapabilityEngineDescriptor, createCapabilitySourceRef } from '../contracts/capabilityContracts.js';
import { createArchitectCapabilityCatalog, createBuiltInCapabilityRegistry } from './builtInCapabilityCatalog.js';
import { CapabilityEngineRegistry } from './capabilityEngineRegistry.js';

const workspaceId = 'workspace-capability';
const moduleSource = (moduleCode, fields) => ({ workspaceId, kind: 'MODULE', ref: `module:${moduleCode}`, moduleCode, formSchema: { schemaVersion: '1.0.0', fields } });
const sources = new Map([
  ['module:RESERVATION', moduleSource('RESERVATION', [{ key: 'guestName', type: 'text' }, { key: 'arrivalDate', type: 'date' }, { key: 'departureDate', type: 'date' }, { key: 'room', type: 'entity-reference', entityTypeId: 'room-type' }])],
  ['module:HOLIDAY_REQUEST', moduleSource('HOLIDAY_REQUEST', [{ key: 'employeeName', type: 'text' }, { key: 'startDate', type: 'date' }, { key: 'endDate', type: 'date' }, { key: 'employee', type: 'entity-reference', entityTypeId: 'core:employee' }])],
  ['module:MEETING', moduleSource('MEETING', [{ key: 'title', type: 'text' }, { key: 'startDateTime', type: 'datetime' }, { key: 'endDateTime', type: 'datetime' }, { key: 'location', type: 'entity-reference', entityTypeId: 'core:location' }])],
]);
const context = (workspace = workspaceId) => ({ workspaceId: workspace, resolveSource: async (source) => sources.get(source.ref) || null });
const calendar = (sourceRef, mapping, options = {}) => createCalendarDefinitionV1({ definitionId: `calendar:${sourceRef.split(':')[1].toLowerCase()}`, workspaceId: options.workspaceId || workspaceId, sourceRef, mapping, status: options.status || CAPABILITY_DEFINITION_STATUSES.DRAFT });

describe('Composable Capability Engine architecture', () => {
  it('registers versioned descriptors and lists them deterministically', () => {
    const registry = new CapabilityEngineRegistry();
    registry.register({ engineId: 'workflow', contractVersion: CAPABILITY_CONTRACT_VERSION, name: 'Workflow', description: 'Transitions', availability: 'ARCHITECTURE_ONLY', mode: 'ACTION', definitionTypes: [], supportedSourceKinds: ['MODULE'], capabilities: [], requires: [], optionalDependencies: [] });
    registry.register({ engineId: 'calendar', contractVersion: CAPABILITY_CONTRACT_VERSION, name: 'Calendar', description: 'Projection', availability: 'ARCHITECTURE_ONLY', mode: 'READ', definitionTypes: ['CalendarDefinitionV1'], supportedSourceKinds: ['MODULE'], capabilities: [], requires: [], optionalDependencies: [] });
    expect(registry.list().map((item) => item.engineId)).toEqual(['calendar', 'workflow']);
    expect(registry.has('calendar')).toBe(true);
    expect(registry.get('unknown')).toBeNull();
  });

  it('rejects duplicate registration, version mismatch, invalid availability, and dependency cycles', () => {
    const registry = new CapabilityEngineRegistry();
    const item = { engineId: 'calendar', contractVersion: CAPABILITY_CONTRACT_VERSION, name: 'Calendar', description: 'Projection', availability: 'ARCHITECTURE_ONLY', mode: 'READ', definitionTypes: [], supportedSourceKinds: ['MODULE'], capabilities: [], requires: [], optionalDependencies: [] };
    registry.register(item);
    expect(() => registry.register(item)).toThrow('already registered');
    expect(() => createCapabilityEngineDescriptor({ ...item, engineId: 'future', contractVersion: '2.0.0' })).toThrow('Unsupported');
    expect(() => createCapabilityEngineDescriptor({ ...item, engineId: 'future', availability: 'PLANNED' })).toThrow('availability');
    const cycles = new CapabilityEngineRegistry();
    cycles.register({ ...item, engineId: 'alpha', requires: ['beta'] });
    expect(() => cycles.register({ ...item, engineId: 'beta', requires: ['alpha'] })).toThrow('cycle');
  });

  it('validates typed source references and rejects arbitrary/cross-Workspace paths', () => {
    expect(createCapabilitySourceRef({ kind: 'MODULE', ref: 'module:RESERVATION', workspaceId }, workspaceId).ref).toBe('module:RESERVATION');
    expect(() => createCapabilitySourceRef({ kind: 'MODULE', ref: 'workspaces/foo/modules/bar', workspaceId })).toThrow('typed canonical');
    expect(() => createCapabilitySourceRef({ kind: 'MODULE', ref: 'module:RESERVATION', workspaceId: 'other' }, workspaceId)).toThrow('Cross-Workspace');
    expect(() => createCapabilityDefinition({ definitionId: 'bad', definitionVersion: '1.0.0', engineId: 'calendar', contractVersion: '1.0.0', workspaceId, source: { kind: 'MODULE', ref: 'module:RESERVATION', workspaceId }, configuration: { collectionPath: 'workspaces/x/records' }, status: 'DRAFT' })).toThrow('Unsafe');
  });

  it.each([
    ['Reservation', 'module:RESERVATION', { titleField: 'guestName', startField: 'arrivalDate', endField: 'departureDate', resourceField: 'room' }],
    ['Holiday', 'module:HOLIDAY_REQUEST', { titleField: 'employeeName', startField: 'startDate', endField: 'endDate', resourceField: 'employee' }],
    ['Meeting', 'module:MEETING', { titleField: 'title', startField: 'startDateTime', endField: 'endDateTime', resourceField: 'location' }],
  ])('validates CalendarDefinitionV1 %s mapping without a Calendar runtime', async (_name, sourceRef, mapping) => {
    const result = await createBuiltInCapabilityRegistry({ calendar: { definitionValidator: validateCalendarDefinitionV1 } }).validateDefinition(calendar(sourceRef, mapping), context());
    expect(result.valid).toBe(true);
    expect(result.operational).toBe(false);
    expect(result.definition.configuration.mapping).toEqual(mapping);
  });

  it('rejects unknown sources, unknown fields, wrong field types, and active architecture-only definitions', async () => {
    const registry = createBuiltInCapabilityRegistry({ calendar: { definitionValidator: validateCalendarDefinitionV1 } });
    const unknownEngine = createCapabilityDefinition({ definitionId: 'unknown:def', definitionVersion: '1.0.0', engineId: 'unknown', contractVersion: '1.0.0', workspaceId, source: { kind: 'MODULE', ref: 'module:RESERVATION', workspaceId }, configuration: {}, status: 'DRAFT' });
    expect((await registry.validateDefinition(unknownEngine, context())).issues.map((item) => item.code)).toContain('UNKNOWN_ENGINE');
    expect((await registry.validateDefinition(calendar('module:UNKNOWN', { titleField: 'title', startField: 'startDate' }), context())).issues.map((item) => item.code)).toContain('UNKNOWN_SOURCE');
    expect((await registry.validateDefinition(calendar('module:RESERVATION', { titleField: 'missing', startField: 'arrivalDate' }), context())).issues.map((item) => item.code)).toContain('UNKNOWN_FIELD');
    expect((await registry.validateDefinition(calendar('module:RESERVATION', { titleField: 'guestName', startField: 'guestName', resourceField: 'guestName' }), context())).issues.map((item) => item.code)).toEqual(expect.arrayContaining(['WRONG_FIELD_TYPE']));
    const active = calendar('module:RESERVATION', { titleField: 'guestName', startField: 'arrivalDate' }, { status: 'ACTIVE' });
    expect((await registry.validateDefinition(active, context())).issues).toHaveLength(0);
    const architectureOnly = createCapabilityDefinition({ definitionId: 'workflow:active', definitionVersion: '1.0.0', engineId: 'workflow', contractVersion: CAPABILITY_CONTRACT_VERSION, workspaceId, source: { kind: 'MODULE', ref: 'module:RESERVATION', workspaceId }, configuration: {}, status: 'ACTIVE' });
    expect((await registry.validateDefinition(architectureOnly, context())).issues.map((item) => item.code)).toContain('ENGINE_NOT_AVAILABLE');
  });

  it('enforces resolver Workspace ownership for Personal and Organization compatible contracts', async () => {
    const registry = createBuiltInCapabilityRegistry({ calendar: { definitionValidator: validateCalendarDefinitionV1 } });
    const personal = await registry.validateDefinition(calendar('module:RESERVATION', { titleField: 'guestName', startField: 'arrivalDate' }), context(workspaceId));
    expect(personal.valid).toBe(true);
    const cross = await registry.validateDefinition(calendar('module:RESERVATION', { titleField: 'guestName', startField: 'arrivalDate' }), { workspaceId, resolveSource: async () => ({ ...sources.get('module:RESERVATION'), workspaceId: 'other' }) });
    expect(cross.issues.map((item) => item.code)).toContain('CROSS_WORKSPACE_SOURCE');
  });

  it('supports conceptual composition without Engine ownership of the Module', async () => {
    const calendarDefinition = calendar('module:HOLIDAY_REQUEST', { titleField: 'employeeName', startField: 'startDate', endField: 'endDate', resourceField: 'employee' });
    const approvalDefinition = createCapabilityDefinition({ definitionId: 'approval:holiday', definitionVersion: '1.0.0', engineId: 'approval', contractVersion: '1.0.0', workspaceId, source: { kind: 'MODULE', ref: 'module:HOLIDAY_REQUEST', workspaceId }, configuration: { requesterField: 'employee', statusField: 'status' }, status: 'DRAFT' });
    const bindings = [createCapabilityBinding({ engineId: 'calendar', contractVersion: '1.0.0', definitionRef: calendarDefinition.definitionId, sourceRef: calendarDefinition.source.ref }), createCapabilityBinding({ engineId: 'approval', contractVersion: '1.0.0', definitionRef: approvalDefinition.definitionId, sourceRef: approvalDefinition.source.ref })];
    expect(new Set(bindings.map((item) => item.sourceRef))).toEqual(new Set(['module:HOLIDAY_REQUEST']));
    expect(calendarDefinition).not.toHaveProperty('records');
    expect(approvalDefinition).not.toHaveProperty('view');
  });

  it('rejects executable configuration and enforces configuration bounds', () => {
    for (const configuration of [{ script: 'run()' }, { moduleUrl: 'https://example.invalid/plugin.js' }, { expression: 'record.total > 0' }, { nested: { eval: 'x' } }]) expect(() => assertCapabilityConfigurationSafe(configuration)).toThrow('Unsafe');
    expect(() => assertCapabilityConfigurationSafe({ handler: () => true })).toThrow('executable');
    let deep = {};
    for (let index = 0; index < 10; index += 1) deep = { child: deep };
    expect(() => assertCapabilityConfigurationSafe(deep)).toThrow('depth');
  });

  it('exposes a code-free deterministic catalog to Workspace Architect without claiming availability', () => {
    const catalog = createArchitectCapabilityCatalog();
    expect(catalog.map((item) => item.engineId)).toEqual([...catalog.map((item) => item.engineId)].sort());
    expect(catalog.find((item) => item.engineId === 'calendar')).toEqual(expect.objectContaining({ availability: CAPABILITY_AVAILABILITY.AVAILABLE, operational: true }));
    expect(catalog.every((item) => !Object.values(item).some((value) => typeof value === 'function'))).toBe(true);
    const semanticModel = createWorkspaceSemanticModel(createWorkspaceConfigurationSnapshot({ workspaceId }));
    expect(semanticModel.capabilityCatalog.find((item) => item.engineId === 'calendar').operational).toBe(true);
  });

  it('keeps Engine, Definition, Binding and canonical data contracts distinct', () => {
    const descriptorValue = createBuiltInCapabilityRegistry({ calendar: { definitionValidator: validateCalendarDefinitionV1 } }).get('calendar');
    const definition = calendar('module:RESERVATION', { titleField: 'guestName', startField: 'arrivalDate' });
    const binding = createCapabilityBinding({ engineId: 'calendar', contractVersion: '1.0.0', definitionRef: definition.definitionId, sourceRef: definition.source.ref });
    expect(descriptorValue.mode).toBe(CAPABILITY_MODES.READ);
    expect(definition.source.kind).toBe(CAPABILITY_SOURCE_KINDS.MODULE);
    expect(binding.definitionRef).toBe(definition.definitionId);
    expect(descriptorValue).not.toHaveProperty('configuration');
    expect(definition).not.toHaveProperty('engineImplementation');
    expect(binding).not.toHaveProperty('data');
  });
});
