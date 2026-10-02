import { describe, expect, it } from 'vitest';
import { createWorkspaceConfigurationSnapshot } from '../automat/automatContracts.js';
import { createDeterministicPlanningAdapter } from './deterministicPlanningAdapter.js';
import { createSystemPlanningOrchestrator } from './systemPlanningOrchestrator.js';

const emptySnapshot = (workspaceId = 'workspace-1') => createWorkspaceConfigurationSnapshot({ workspaceId });
const input = (description, workspaceId = 'workspace-1') => ({ schemaVersion: '1.0.0', workspaceId, organizationName: 'Test Organization', description, userDescription: description, existingConfiguration: emptySnapshot(workspaceId) });
const plan = (description, options = {}) => createSystemPlanningOrchestrator(options).plan({ requestId: options.requestId || 'request-1', workspaceId: 'workspace-1', requestedBy: 'user-1', organizationInput: input(description), snapshot: options.snapshot || emptySnapshot(), onStage: options.onStage });

function codes(items, field) { return items.map((item) => item[field]); }

describe('Step 9.1 System Planning Orchestrator', () => {
  it('produces a valid hotel-specific BuildPlan through all specialist stages', async () => {
    const stages = [];
    const result = await plan('I run a 40-room hotel with a restaurant, parking area, maintenance team and 18 employees.', { onStage: (stage) => stages.push(stage) });
    expect(result.validation.status).toBe('VALID');
    expect(stages).toEqual(['ORGANIZATION_ANALYZER', 'DOMAIN_MODEL_PLANNER', 'PROCESS_PLANNER', 'MODULE_PLANNER', 'WORKSPACE_EXPERIENCE_PLANNER', 'SYSTEM_REVIEWER', 'VALIDATING']);
    expect(codes(result.plan.businessAreas, 'code')).toEqual(expect.arrayContaining(['FRONT_OFFICE', 'HOUSEKEEPING', 'MAINTENANCE']));
    expect(codes(result.plan.domainObjects, 'code')).toEqual(expect.arrayContaining(['ROOM', 'GUEST', 'RESERVATION', 'STAY']));
    expect(codes(result.plan.proposedModules, 'moduleCode')).toEqual(expect.arrayContaining(['RESERVATION', 'CHECK_IN', 'HOUSEKEEPING', 'MAINTENANCE']));
    expect(result.review.diagnostics.genericModuleRatio).toBe(0);
    expect(codes(result.plan.capabilities, 'code')).toEqual(expect.arrayContaining(['FORM_CAPTURE', 'ENTITY_REFERENCE', 'REPORTING', 'WIDGET_VISUALIZATION']));
    expect(result.plan.proposedWorksets.length).toBeGreaterThan(2);
    expect(result.plan.proposedWidgets.length).toBeGreaterThan(1);
    expect(result.plan.proposedReports.length).toBeGreaterThan(1);
    expect(result.plan.proposedModules.find((item) => item.moduleCode === 'HOUSEKEEPING').formSchema.fields.length).toBeGreaterThan(4);
    expect(result.plan.proposedModules.find((item) => item.moduleCode === 'RESERVATION').formSchema.fields[0]).toMatchObject({ type: 'entity-reference', entityTypeId: 'entityType:ROOM' });
    expect(result.plan.organizationProfile.assumptions.length).toBeGreaterThan(0);
    expect(result.plan.unresolvedQuestions).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'OPTIONAL_REFINEMENT' })]));
  });

  it('produces theatre-specific operations without hotel concepts', async () => {
    const result = await plan('I operate a theatre producing live shows with actors, rehearsals, performances, costumes, props, lighting and sound.');
    expect(result.validation.status).toBe('VALID');
    expect(codes(result.plan.businessAreas, 'code')).toEqual(expect.arrayContaining(['PRODUCTIONS', 'REHEARSALS', 'PERFORMANCES', 'STAGE']));
    expect(codes(result.plan.proposedModules, 'moduleCode')).toEqual(expect.arrayContaining(['REHEARSAL_REPORT', 'SHOW_REPORT', 'COSTUME_PROP_CHECK', 'TECHNICAL_CHECK']));
    expect(codes(result.plan.proposedModules, 'moduleCode')).not.toContain('RESERVATION');
    expect(result.plan.proposedRelationships).toContainEqual(expect.objectContaining({ relationshipType: 'HAS_PERFORMANCE' }));
  });

  it('produces school-specific domain and process planning', async () => {
    const result = await plan('I manage a private school with 300 students, 35 teachers, 20 classrooms and shared equipment.');
    expect(result.validation.status).toBe('VALID');
    expect(codes(result.plan.domainObjects, 'code')).toEqual(expect.arrayContaining(['STUDENT', 'TEACHER', 'CLASS', 'COURSE', 'EQUIPMENT']));
    expect(codes(result.plan.proposedModules, 'moduleCode')).toEqual(expect.arrayContaining(['ATTENDANCE', 'STUDENT_INCIDENT', 'EQUIPMENT_CHECK']));
    expect(result.plan.domainObjects.find((item) => item.code === 'TEACHER')).toMatchObject({ classification: 'CORE_REUSE', coreEntityCode: 'EMPLOYEE' });
  });

  it('keeps resource identities stable across repeated planning', async () => {
    const description = 'I run a hotel with rooms, guests, housekeeping and maintenance.';
    const first = await plan(description, { requestId: 'request-a' });
    const second = await plan(description, { requestId: 'request-b' });
    expect(codes(first.plan.proposedEntityTypes, 'ref')).toEqual(codes(second.plan.proposedEntityTypes, 'ref'));
    expect(codes(first.plan.proposedModules, 'ref')).toEqual(codes(second.plan.proposedModules, 'ref'));
    expect(first.plan.planId).not.toBe(second.plan.planId);
  });

  it('classifies compatible existing configuration as REUSE and incompatible configuration as CONFLICT', async () => {
    const description = 'I run a hotel with rooms, reservations, housekeeping and maintenance.';
    const first = await plan(description);
    const room = first.plan.proposedEntityTypes.find((item) => item.code === 'ROOM');
    const reservation = first.plan.proposedModules.find((item) => item.moduleCode === 'RESERVATION');
    const compatible = createWorkspaceConfigurationSnapshot({ workspaceId: 'workspace-1', entityTypes: [{ typeId: 'room-id', code: 'ROOM', fields: room.fields }], modules: [{ moduleId: 'reservation-id', moduleCode: 'RESERVATION', formSchema: reservation.formSchema }] });
    const reused = await plan(description, { requestId: 'request-reuse', snapshot: compatible });
    expect(reused.validation.classifications).toEqual(expect.arrayContaining([expect.objectContaining({ ref: 'entityType:ROOM', operation: 'REUSE' }), expect.objectContaining({ ref: 'module:RESERVATION', operation: 'REUSE' })]));
    const conflicting = createWorkspaceConfigurationSnapshot({ workspaceId: 'workspace-1', entityTypes: compatible.entityTypes, modules: [{ ...compatible.modules[0], formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'different', label: 'Different', type: 'text', required: true }] } }] });
    const conflict = await plan(description, { requestId: 'request-conflict', snapshot: conflicting });
    expect(conflict.validation.status).toBe('INVALID');
    expect(conflict.validation.classifications).toContainEqual(expect.objectContaining({ ref: 'module:RESERVATION', operation: 'CONFLICT' }));
  });

  it('warns when generic administration dominates a specialized plan', async () => {
    const adapter = createDeterministicPlanningAdapter();
    adapter.set('MODULE_PLANNER', { schemaVersion: '1.0.0', proposedModules: ['EXPENSE', 'TASKS', 'DOCUMENTS'].map((moduleCode) => ({ ref: `module:${moduleCode}`, moduleCode, name: moduleCode, description: 'Generic administration', category: 'ADMIN', capabilities: ['records'], formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'title', label: 'Title', type: 'text', required: true }] }, rationale: 'Generic' })) });
    const result = await plan('I run a hotel with rooms and guests.', { adapter });
    expect(result.plan.warnings).toContainEqual(expect.objectContaining({ code: 'GENERIC_OVER_SPECIALIZATION' }));
    expect(result.review.diagnostics.genericModuleRatio).toBe(1);
  });

  it('deterministically rejects broken generated references, fields, and capabilities', async () => {
    const adapter = createDeterministicPlanningAdapter();
    const original = adapter.outputs.get('MODULE_PLANNER');
    adapter.set('MODULE_PLANNER', async (definition, request) => {
      const output = await original(definition, request);
      output.proposedModules[0].formSchema.fields[0].entityTypeId = 'entityType:MISSING';
      output.proposedModules[0].formSchema.fields[1].type = 'unsupported-field';
      output.proposedModules[0].capabilities.push('arbitrary-admin');
      return output;
    });
    const result = await plan('I run a hotel with rooms and guests.', { adapter });
    expect(result.validation.status).toBe('INVALID');
    expect(result.validation.issues.map((item) => item.code)).toEqual(expect.arrayContaining(['BROKEN_REFERENCE', 'INVALID_FORM_SCHEMA', 'UNSUPPORTED_CAPABILITY']));
  });

  it('settles malformed output, oversized output, missing stages, timeout, and provider failure', async () => {
    const invalidStructure = createDeterministicPlanningAdapter();
    invalidStructure.set('ORGANIZATION_ANALYZER', 'not-structured-json');
    await expect(plan('I run a hotel with rooms and guests.', { adapter: invalidStructure })).rejects.toMatchObject({ stage: 'ORGANIZATION_ANALYZER' });
    const malformed = createDeterministicPlanningAdapter();
    malformed.set('DOMAIN_MODEL_PLANNER', { schemaVersion: '1.0.0', domainObjects: [], proposedEntityTypes: [], proposedRelationships: [], unknown: true });
    await expect(plan('I run a hotel with rooms and guests.', { adapter: malformed })).rejects.toMatchObject({ code: 'PLANNING_STAGE_FAILED', stage: 'DOMAIN_MODEL_PLANNER' });
    const oversized = createDeterministicPlanningAdapter();
    oversized.set('ORGANIZATION_ANALYZER', { schemaVersion: '1.0.0', organizationProfile: { description: 'x'.repeat(300_000) }, industryAnalysis: {}, businessAreas: [], domainObjects: [], processes: [], capabilities: [], missingInformation: [], warnings: [] });
    await expect(plan('I run a hotel with rooms and guests.', { adapter: oversized })).rejects.toMatchObject({ stage: 'ORGANIZATION_ANALYZER' });
    const missing = createDeterministicPlanningAdapter();
    missing.outputs.delete('PROCESS_PLANNER');
    await expect(plan('I run a hotel with rooms and guests.', { adapter: missing })).rejects.toMatchObject({ stage: 'PROCESS_PLANNER' });
    const timeout = createDeterministicPlanningAdapter();
    timeout.set('MODULE_PLANNER', () => new Promise(() => {}));
    await expect(plan('I run a hotel with rooms and guests.', { adapter: timeout, timeoutMs: 5 })).rejects.toMatchObject({ stage: 'MODULE_PLANNER' });
    const failed = createDeterministicPlanningAdapter();
    failed.set('SYSTEM_REVIEWER', () => { throw new Error('review failed'); });
    await expect(plan('I run a hotel with rooms and guests.', { adapter: failed })).rejects.toMatchObject({ stage: 'SYSTEM_REVIEWER' });
  }, 10_000);
});
