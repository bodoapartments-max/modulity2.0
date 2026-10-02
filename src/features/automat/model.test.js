import { describe, expect, it } from 'vitest';
import { AUTOMAT_UI_STATES, createOrganizationInput, planningStateForStage } from './model.js';

describe('Automat Planner model', () => {
  it('builds bounded structured input for the current Workspace', () => {
    expect(createOrganizationInput({ workspace: { workspaceId: 'workspace-1', name: 'Hotel', country: 'Hungary' }, description: '  A hotel with rooms  ', employeeCount: '18' })).toMatchObject({ workspaceId: 'workspace-1', organizationName: 'Hotel', country: 'Hungary', employeeCount: 18, userDescription: 'A hotel with rooms' });
    expect(() => createOrganizationInput({ workspace: { workspaceId: 'workspace-1', name: 'Hotel' }, description: '', employeeCount: '' })).toThrow('Describe');
    expect(() => createOrganizationInput({ workspace: { workspaceId: 'workspace-1', name: 'Hotel' }, description: 'Hotel', employeeCount: '-1' })).toThrow('Employee count');
  });

  it('maps specialist stages to explicit user-facing states', () => {
    expect(planningStateForStage('ORGANIZATION_ANALYZER')).toBe(AUTOMAT_UI_STATES.ANALYZING);
    expect(planningStateForStage('MODULE_PLANNER')).toBe(AUTOMAT_UI_STATES.PLANNING);
    expect(planningStateForStage('VALIDATING')).toBe(AUTOMAT_UI_STATES.VALIDATING);
  });
});
