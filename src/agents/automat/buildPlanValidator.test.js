import { describe, expect, it } from 'vitest';
import { validateAutomatBuildPlan } from './buildPlanValidator.js';
import { createEmptyHotelPlan, createEmptyHotelSnapshot, createExistingHotelSnapshot, createInvalidHotelPlan } from './automatFixtures.js';

describe('deterministic AutomatBuildPlan Validator', () => {
  it('represents a hotel generically and validates without industry-specific branches', () => {
    const result = validateAutomatBuildPlan(createEmptyHotelPlan(), createEmptyHotelSnapshot());
    expect(result.status).toBe('VALID');
    expect(result.classifications.filter((item) => item.operation === 'CREATE')).toHaveLength(12);
    expect(createEmptyHotelPlan().proposedModules.map((item) => item.moduleCode)).toEqual(['RESERVATION', 'CHECK_IN', 'HOUSEKEEPING', 'MAINTENANCE']);
  });

  it('classifies compatible existing Entity Type and Module as REUSE rather than duplicate creation', () => {
    const result = validateAutomatBuildPlan(createEmptyHotelPlan(), createExistingHotelSnapshot());
    expect(result.status).toBe('VALID');
    expect(result.classifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: 'entityType:ROOM', operation: 'REUSE', existingResourceId: 'type-room' }),
      expect.objectContaining({ ref: 'module:RESERVATION', operation: 'REUSE', existingResourceId: 'module-reservation' }),
      expect.objectContaining({ ref: 'workset:FRONT_DESK', operation: 'REUSE', existingResourceId: 'workset-front-desk' }),
    ]));
  });

  it('classifies incompatible existing resources as CONFLICT without replacement deletion', () => {
    const snapshot = structuredClone(createExistingHotelSnapshot());
    snapshot.modules[0].formSchema.fields[0].type = 'text';
    const result = validateAutomatBuildPlan(createEmptyHotelPlan(), snapshot);
    expect(result.status).toBe('INVALID');
    expect(result.classifications).toContainEqual(expect.objectContaining({ ref: 'module:RESERVATION', operation: 'CONFLICT' }));
    expect(result.classifications.map((item) => item.operation)).not.toContain('REPLACE_DELETE');
  });

  it('rejects duplicate codes, missing Entity references, unsupported fields, and invalid Widget sources', () => {
    const result = validateAutomatBuildPlan(createInvalidHotelPlan(), createEmptyHotelSnapshot());
    expect(result.status).toBe('INVALID');
    expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining(['DUPLICATE_MODULE_CODE', 'BROKEN_REFERENCE', 'INVALID_FORM_SCHEMA', 'INVALID_WIDGET']));
    expect(result.issues.every((item) => item.path && item.message && item.severity)).toBe(true);
  });

  it('rejects wrong Workspace, broken Workset/Report/Relationship references, unsupported capabilities, and unsafe configuration', () => {
    const plan = structuredClone(createEmptyHotelPlan());
    plan.proposedWorksets[0].moduleRefs = ['module:MISSING'];
    plan.proposedReports[0].definition.dataSources[0].moduleRef = 'module:MISSING';
    plan.proposedRelationships[0].targetRef = 'entityType:MISSING';
    plan.proposedModules[0].capabilities.push('arbitrary-admin');
    plan.proposedModules[0].arbitrary = true;
    plan.organizationProfile.script = 'doSomething()';
    const result = validateAutomatBuildPlan(plan, { ...createEmptyHotelSnapshot(), workspaceId: 'another-workspace' });
    expect(result.status).toBe('INVALID');
    expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining(['WORKSPACE_MISMATCH', 'BROKEN_REFERENCE', 'UNSUPPORTED_CAPABILITY', 'UNSAFE_CONFIGURATION', 'UNKNOWN_PROPERTY']));
  });
});
