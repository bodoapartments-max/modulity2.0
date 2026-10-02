import { createAutomatBuildPlan, createPlanRef, createWorkspaceConfigurationSnapshot } from './automatContracts.js';

const requestedBy = 'user:test-owner';
const workspaceId = 'workspace:test-hotel';
const entity = (code, name, fields = []) => ({ ref: createPlanRef('entityType', code), code, name, fields });
const moduleProposal = (code, name, fields) => ({ ref: createPlanRef('module', code), moduleCode: code, name, capabilities: ['records', 'reports', 'widgets'], formSchema: { schemaVersion: '1.0.0', fields } });
const roomField = { key: 'room', label: 'Room', type: 'entity-reference', required: true, entityTypeId: 'entityType:ROOM' };

export function createEmptyHotelPlan(overrides = {}) {
  return createAutomatBuildPlan({
    planId: 'plan:test-hotel', planVersion: '1.0.0', status: 'READY_FOR_REVIEW', workspaceId,
    source: { requestedBy, requestId: 'request:test-hotel', agentExecutions: ['execution:test-hotel'] },
    organizationProfile: { name: 'Test Hotel', employeeCount: 18, facilities: ['40 rooms', 'restaurant', 'parking'] },
    industryAnalysis: { likelyIndustry: 'hospitality' },
    businessAreas: ['Front Desk', 'Housekeeping', 'Maintenance'], domainObjects: ['ROOM', 'GUEST', 'RESERVATION', 'STAY'],
    processes: ['Reservation', 'Check-in', 'Room cleaning', 'Maintenance request'], capabilities: ['room-operations', 'guest-operations'],
    proposedEntityTypes: [entity('ROOM', 'Room'), entity('GUEST', 'Guest'), entity('RESERVATION', 'Reservation'), entity('STAY', 'Stay')],
    proposedModules: [
      moduleProposal('RESERVATION', 'Reservation', [roomField, { key: 'guestName', label: 'Guest name', type: 'text', required: true }]),
      moduleProposal('CHECK_IN', 'Check-in', [roomField, { key: 'guestName', label: 'Guest name', type: 'text', required: true }]),
      moduleProposal('HOUSEKEEPING', 'Housekeeping', [roomField, { key: 'notes', label: 'Notes', type: 'textarea', required: false }]),
      moduleProposal('MAINTENANCE', 'Maintenance', [roomField, { key: 'issue', label: 'Issue', type: 'textarea', required: true }]),
    ],
    proposedRelationships: [{ ref: 'relationship:ROOM_STAY', sourceRef: 'entityType:ROOM', targetRef: 'entityType:STAY', relationshipType: 'HOSTS' }],
    proposedWorksets: [{ ref: 'workset:FRONT_DESK', name: 'Front Desk', moduleRefs: ['module:RESERVATION', 'module:CHECK_IN'] }],
    proposedWidgets: [{ ref: 'widget:OCCUPANCY', name: 'Occupancy', moduleRefs: ['module:RESERVATION'], definition: { source: 'RECORDS', metric: 'COUNT', filters: [], display: { limit: 10 } } }],
    proposedReports: [{ ref: 'report:RESERVATIONS', name: 'Reservations', definition: { dataSources: [{ sourceType: 'RECORDS', moduleRef: 'module:RESERVATION' }], filters: [], groupBy: [], metrics: [{ type: 'COUNT', key: 'count' }], columns: [], sort: [], visualization: { type: 'TABLE' } } }],
    warnings: [], unresolvedQuestions: [], validation: null,
    provenance: { contractVersion: '1.0.0', generatedBy: [{ agentCode: 'SYSTEM_REVIEWER', agentVersion: '1.0.0', requestId: 'request:test-hotel', providerAdapter: 'DETERMINISTIC_TEST' }] },
    ...overrides,
  });
}

export function createEmptyHotelSnapshot() {
  return createWorkspaceConfigurationSnapshot({ workspaceId });
}

export function createExistingHotelSnapshot() {
  const plan = createEmptyHotelPlan();
  return createWorkspaceConfigurationSnapshot({
    workspaceId,
    entityTypes: [{ typeId: 'type-room', code: 'ROOM', fields: plan.proposedEntityTypes[0].fields }],
    modules: [
      { moduleId: 'module-reservation', moduleCode: 'RESERVATION', formSchema: plan.proposedModules[0].formSchema },
      { moduleId: 'module-check-in', moduleCode: 'CHECK_IN', formSchema: plan.proposedModules[1].formSchema },
    ],
    worksets: [{ worksetId: 'workset-front-desk', name: 'Front Desk', moduleIds: ['module-reservation', 'module-check-in'] }],
  });
}

export function createInvalidHotelPlan() {
  const plan = structuredClone(createEmptyHotelPlan());
  plan.proposedModules.push({ ...structuredClone(plan.proposedModules[0]), ref: 'module:RESERVATION_COPY' });
  plan.proposedModules[1].formSchema.fields[0].entityTypeId = 'entityType:MISSING';
  plan.proposedModules[2].formSchema.fields[0].type = 'unsupported-field';
  plan.proposedWidgets[0].moduleRefs = ['module:MISSING'];
  plan.proposedWidgets[0].definition.source = 'UNSAFE';
  return plan;
}
