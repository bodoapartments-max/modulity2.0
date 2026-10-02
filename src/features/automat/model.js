export const AUTOMAT_UI_STATES = Object.freeze({ IDLE: 'IDLE', ANALYZING: 'ANALYZING', PLANNING: 'PLANNING', VALIDATING: 'VALIDATING', READY: 'READY', ERROR: 'ERROR' });

export function planningStateForStage(stage) {
  if (stage === 'ORGANIZATION_ANALYZER') return AUTOMAT_UI_STATES.ANALYZING;
  if (stage === 'VALIDATING') return AUTOMAT_UI_STATES.VALIDATING;
  return AUTOMAT_UI_STATES.PLANNING;
}

export function createOrganizationInput({ workspace, description, industry = '', country = '', employeeCount = '' }) {
  if (!workspace?.workspaceId || !workspace.name) throw new Error('Current Workspace is required');
  if (!description?.trim()) throw new Error('Describe your organization before building a plan.');
  const parsedEmployeeCount = employeeCount === '' ? null : Number(employeeCount);
  if (parsedEmployeeCount !== null && (!Number.isInteger(parsedEmployeeCount) || parsedEmployeeCount < 0)) throw new Error('Employee count must be a non-negative whole number.');
  return { schemaVersion: '1.0.0', workspaceId: workspace.workspaceId, organizationName: workspace.name, description: workspace.description || '', industry: industry.trim() || undefined, country: country.trim() || workspace.country || undefined, size: undefined, employeeCount: parsedEmployeeCount, locations: [], facilities: [], assets: [], services: [], userDescription: description.trim(), existingConfiguration: {} };
}
