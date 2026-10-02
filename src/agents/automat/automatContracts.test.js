import { describe, expect, it } from 'vitest';
import { AUTOMAT_BOUNDS, createAutomatBuildPlan, createPlanRef, createWorkspaceConfigurationSnapshot, parsePlanRef, validateOrganizationAnalysisInput, validateOrganizationAnalysisOutput } from './automatContracts.js';
import { createEmptyHotelPlan } from './automatFixtures.js';

describe('Automat contracts', () => {
  it('creates and parses stable temporary plan references', () => {
    expect(createPlanRef('entityType', 'ROOM')).toBe('entityType:ROOM');
    expect(parsePlanRef('module:RESERVATION')).toEqual({ kind: 'module', code: 'RESERVATION' });
    expect(() => parsePlanRef('module:bad-code')).toThrow('Invalid plan reference');
  });

  it('accepts a strict versioned reviewable BuildPlan and rejects unknown properties', () => {
    expect(createAutomatBuildPlan(createEmptyHotelPlan()).status).toBe('READY_FOR_REVIEW');
    expect(() => createAutomatBuildPlan({ ...createEmptyHotelPlan(), executable: 'code' })).toThrow('unknown properties');
    expect(() => createAutomatBuildPlan({ ...createEmptyHotelPlan(), planVersion: '2.0.0' })).toThrow('Unsupported');
    expect(() => createAutomatBuildPlan({ ...createEmptyHotelPlan(), provenance: { contractVersion: '1.0.0', generatedBy: [{}] } })).toThrow('agent provenance');
  });

  it('enforces bounded BuildPlans and WorkspaceConfigurationSnapshots without operational data', () => {
    const oversizedPlan = structuredClone(createEmptyHotelPlan());
    oversizedPlan.proposedModules = Array.from({ length: AUTOMAT_BOUNDS.MAX_MODULES + 1 }, (_, index) => ({ ...oversizedPlan.proposedModules[0], ref: `module:MODULE_${index}`, moduleCode: `MODULE_${index}` }));
    expect(() => createAutomatBuildPlan(oversizedPlan)).toThrow('exceeds limit');
    const snapshot = createWorkspaceConfigurationSnapshot({ workspaceId: 'workspace-1', modules: [{ moduleId: 'one', records: [{ recordId: 'must-not-copy' }] }] });
    expect(snapshot).not.toHaveProperty('records');
    expect(snapshot.modules[0]).not.toHaveProperty('records');
    expect(snapshot).not.toHaveProperty('entities');
    expect(() => createWorkspaceConfigurationSnapshot({ workspaceId: 'workspace-1', modules: Array.from({ length: AUTOMAT_BOUNDS.MAX_SNAPSHOT_ITEMS_PER_TYPE + 1 }, (_, index) => ({ moduleId: String(index) })) })).toThrow('exceeds limit');
  });

  it('defines strict Organization Analyzer input/output contracts without implementing intelligence', () => {
    expect(validateOrganizationAnalysisInput({ schemaVersion: '1.0.0', workspaceId: 'workspace-1', organizationName: 'Hotel', userDescription: '40 rooms' })).toBe(true);
    expect(validateOrganizationAnalysisOutput({ schemaVersion: '1.0.0', businessAreas: [], domainObjects: [], processes: [], capabilities: [], missingInformation: [], warnings: [], confidence: 0.8 })).toBe(true);
    expect(() => validateOrganizationAnalysisInput({ schemaVersion: '1.0.0', workspaceId: 'workspace-1', organizationName: 'Hotel', rawPrompt: 'unsafe' })).toThrow('unknown properties');
    expect(() => validateOrganizationAnalysisOutput({ schemaVersion: '1.0.0', businessAreas: [], domainObjects: [], processes: [], capabilities: [], missingInformation: [], warnings: [], rawProviderResponse: 'no' })).toThrow('unknown properties');
    expect(() => validateOrganizationAnalysisOutput({ schemaVersion: '1.0.0', businessAreas: [], domainObjects: [], processes: [], capabilities: [], missingInformation: [], warnings: [], confidence: 2 })).toThrow('Confidence');
  });
});
