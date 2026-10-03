import { AUTOMAT_BOUNDS } from '../automat/automatContracts.js';
import { createArchitectCapabilityCatalog } from '../../capabilities/registry/builtInCapabilityCatalog.js';

export const WORKSPACE_ARCHITECT_SCHEMA_VERSION = '1.0.0';
export const WORKSPACE_ARCHITECT_BOUNDS = Object.freeze({ MAX_ITEMS_PER_KIND: 50, MAX_FIELDS_PER_RESOURCE: 20, MAX_CONTEXT_BYTES: 60_000 });
const clone = (value) => structuredClone(value);
const text = (key, label, required = false) => ({ key, label, type: 'text', required });
const textarea = (key, label, required = false) => ({ key, label, type: 'textarea', required });
const date = (key, label, required = false) => ({ key, label, type: 'date', required });
const dateRange = (key, label, required = false) => ({ key, label, type: 'date-range', required });
const datetime = (key, label, required = false) => ({ key, label, type: 'datetime', required });
const datetimeRange = (key, label, required = false) => ({ key, label, type: 'datetime-range', required });
const bool = (key, label, required = false) => ({ key, label, type: 'boolean', required });
const select = (key, label, options, required = false) => ({ key, label, type: 'select', options, required });
const entityRef = (key, label, code, required = true) => ({ key, label, type: 'entity-reference', entityTypeId: `entityType:${code}`, required });
const entityType = (code, name, description, fields) => ({ ref: `entityType:${code}`, code, name, description, fields });
const moduleProposal = (code, name, area, fields, rationale) => ({ ref: `module:${code}`, moduleCode: code, name, description: `${name} operational process`, category: area, businessAreaRef: `businessArea:${area}`, processRef: `process:${code}`, recordType: code, capabilities: ['records', 'reports', 'widgets'], formSchema: { schemaVersion: '1.0.0', fields }, displayConfig: { primaryField: fields[0]?.key || null, listFields: fields.slice(0, 4).map((field) => field.key) }, lifecycle: ['DRAFT', 'SUBMITTED', 'COMPLETED', 'CANCELLED'], ledgerRequirements: null, rationale });
const workset = (code, name, modules) => ({ ref: `workset:${code}`, name, description: `${name} operational context`, moduleRefs: modules.map((codeValue) => `module:${codeValue}`), rationale: 'Groups related processes without granting authorization.' });
const widget = (code, name, moduleCode) => ({ ref: `widget:${code}`, name, moduleRefs: [`module:${moduleCode}`], definition: { type: 'KPI', source: 'RECORDS', metric: 'COUNT', filters: [], display: { limit: 10 } }, rationale: `Bounded operational count for ${name}.` });
const report = (code, name, moduleCode) => ({ ref: `report:${code}`, name, definition: { dataSources: [{ sourceType: 'RECORDS', moduleRef: `module:${moduleCode}` }], filters: [], groupBy: [], metrics: [{ type: 'COUNT', key: 'count' }], columns: [], sort: [], visualization: { type: 'TABLE' } }, rationale: `Bounded summary for ${name}.` });
const area = (code, name) => ({ areaRef: `businessArea:${code}`, code, name, description: `${name} operations`, importance: 'HIGH', domainObjectRefs: [], processRefs: [], capabilityRefs: [], rationale: `${name} is required by the requested evolution.` });
const process = (code, name, areaCode) => ({ processRef: `process:${code}`, code, name, businessAreaRef: `businessArea:${areaCode}`, description: name, participants: [], inputObjectRefs: [], outputObjectRefs: [], trigger: 'Business request', mainStages: ['Capture', 'Process', 'Complete'], exceptions: [], frequency: 'Recurring', capabilityRefs: ['capability:FORM_CAPTURE', 'capability:STATUS_TRACKING'], recommendedModuleRefs: [`module:${code}`] });
const decision = (requestedConcept, operation, targetRef, reason, confidence = 1) => ({ requestedConcept, decision: operation, targetRef, reason, confidence });

function boundedItems(values) { return (values || []).slice(0, WORKSPACE_ARCHITECT_BOUNDS.MAX_ITEMS_PER_KIND); }
function safeText(value, max = 512) { return String(value || '').slice(0, max); }
function compactFields(fields) { return (fields || []).slice(0, WORKSPACE_ARCHITECT_BOUNDS.MAX_FIELDS_PER_RESOURCE).map(({ key, label, type, required, options, entityTypeId }) => ({ key: safeText(key, 100), label: safeText(label, 200), type, required: !!required, ...(options ? { options: clone(options).slice(0, 50) } : {}), ...(entityTypeId ? { entityTypeId: safeText(entityTypeId, 200) } : {}) })); }
export function createWorkspaceSemanticModel(snapshot, capabilityCatalog = createArchitectCapabilityCatalog()) {
  if (!snapshot?.workspaceId) throw new Error('WorkspaceSemanticModel requires a Workspace snapshot');
  const incompleteKinds = Object.entries({ entityTypes: snapshot.entityTypes, modules: snapshot.modules, worksets: snapshot.worksets, widgets: snapshot.widgets, reports: snapshot.reports }).filter(([, values]) => (values || []).length > WORKSPACE_ARCHITECT_BOUNDS.MAX_ITEMS_PER_KIND).map(([key]) => key);
  const model = {
    schemaVersion: WORKSPACE_ARCHITECT_SCHEMA_VERSION,
    workspaceId: snapshot.workspaceId,
    entityTypes: boundedItems(snapshot.entityTypes).map((item) => ({ typeId: safeText(item.typeId, 200), code: safeText(item.code, 100), name: safeText(item.name, 200), description: safeText(item.description), category: item.category || (String(item.typeId).startsWith('core:') ? 'CORE' : 'DOMAIN'), fields: compactFields(item.fields) })),
    modules: boundedItems(snapshot.modules).map((item) => ({ moduleId: safeText(item.moduleId, 200), moduleCode: safeText(item.moduleCode, 100), name: safeText(item.name, 200), description: safeText(item.description), category: safeText(item.category, 100), formSchema: { schemaVersion: item.formSchema?.schemaVersion || '1.0.0', fields: compactFields(item.formSchema?.fields) }, capabilities: clone(item.capabilities || []) })),
    worksets: boundedItems(snapshot.worksets).map(({ worksetId, name, moduleIds }) => ({ worksetId, name, moduleIds: clone(moduleIds || []) })),
    widgets: boundedItems(snapshot.widgets).map(({ widgetId, name, moduleId, moduleIds }) => ({ widgetId, name, moduleId: moduleId || null, moduleIds: clone(moduleIds || []) })),
    reports: boundedItems(snapshot.reports).map(({ reportId, name, dataSources }) => ({ reportId, name, dataSources: clone(dataSources || []) })),
    references: boundedItems(snapshot.modules).flatMap((item) => (item.formSchema?.fields || []).filter((field) => field.type === 'entity-reference').map((field) => ({ moduleCode: item.moduleCode, fieldKey: field.key, targetEntityTypeId: field.entityTypeId }))),
    existingRelationships: boundedItems(snapshot.relationships),
    inferredCoverage: [],
    capabilityCatalog: clone(capabilityCatalog),
    completeness: { status: incompleteKinds.length ? 'ANALYSIS_INCOMPLETE' : 'COMPLETE', truncatedKinds: incompleteKinds },
  };
  if (new TextEncoder().encode(JSON.stringify(model)).length > WORKSPACE_ARCHITECT_BOUNDS.MAX_CONTEXT_BYTES) {
    model.entityTypes = model.entityTypes.map((item) => ({ ...item, fields: [] }));
    model.modules = model.modules.map((item) => ({ ...item, formSchema: { schemaVersion: item.formSchema.schemaVersion, fields: [] } }));
    model.references = [];
    model.completeness = { status: 'ANALYSIS_INCOMPLETE', truncatedKinds: [...new Set([...incompleteKinds, 'contextBytes'])] };
    if (new TextEncoder().encode(JSON.stringify(model)).length > WORKSPACE_ARCHITECT_BOUNDS.MAX_CONTEXT_BYTES) {
      model.entityTypes = model.entityTypes.slice(0, 25);
      model.modules = model.modules.slice(0, 25);
      model.worksets = model.worksets.slice(0, 25);
      model.widgets = model.widgets.slice(0, 25);
      model.reports = model.reports.slice(0, 25);
    }
  }
  return Object.freeze(model);
}

const normalized = (value) => String(value || '').trim().toLowerCase();
const includesAny = (textValue, words) => words.some((word) => textValue.includes(word));
export function classifyBusinessRequest(request) {
  const value = normalized(request);
  if (!value || value.length > 10_000) throw new Error('Business request must contain 1-10000 characters');
  if (includesAny(value, ['employee holiday', 'holiday request', 'vacation request', 'leave request', 'time off', 'employee leave'])) return 'EMPLOYEE_LEAVE';
  if (includesAny(value, ['appointment', 'booking', 'meeting room', 'hairdresser', 'doctor appointment', 'shift booking'])) return 'BOOKING';
  if (includesAny(value, ['restaurant', 'customer order', 'table reservation', 'inventory'])) return 'RESTAURANT_EXPANSION';
  if (includesAny(value, ['room inspection', 'inspect rooms'])) return 'ROOM_INSPECTION';
  if (includesAny(value, ['company vehicle', 'vehicle inspection', 'company cars'])) return 'VEHICLE_OPERATIONS';
  if (includesAny(value, ['school', 'classroom', 'student absence'])) return 'SCHOOL_OPERATIONS';
  if (includesAny(value, ['installation company', 'customer jobs', 'site visits', 'tools'])) return 'INSTALLATION_OPERATIONS';
  if (includesAny(value, ['storage'])) return 'AMBIGUOUS_STORAGE';
  return 'UNSUPPORTED_REQUEST';
}

function existingEntityProposal(model, code) {
  const item = model.entityTypes.find((candidate) => candidate.code === code);
  return item ? entityType(code, item.name, item.description, clone(item.fields)) : null;
}
function existingModuleProposal(model, code) {
  const item = model.modules.find((candidate) => candidate.moduleCode === code);
  return item ? moduleProposal(code, item.name, item.category || 'OPERATIONS', clone(item.formSchema.fields), `Reuses existing ${item.name} process.`) : null;
}
function reuseEntity(model, code, requestedConcept, reason, proposals, decisions) {
  const proposal = existingEntityProposal(model, code);
  if (proposal) { proposals.push(proposal); decisions.push(decision(requestedConcept, 'REUSE', proposal.ref, reason)); return true; }
  return false;
}
function compatibleFields(left = [], right = []) { return JSON.stringify(left.map(({ key, type, required, entityTypeId }) => ({ key, type, required: !!required, entityTypeId: entityTypeId || null }))) === JSON.stringify(right.map(({ key, type, required, entityTypeId }) => ({ key, type, required: !!required, entityTypeId: entityTypeId || null }))); }
function addEntity(proposal, reason, proposals, decisions, model = null) {
  const existing = model?.entityTypes.find((item) => item.code === proposal.code);
  const comparableFields = proposal.fields.map((field) => field.type === 'entity-reference' ? { ...field, entityTypeId: model?.entityTypes.find((item) => `entityType:${item.code}` === field.entityTypeId)?.typeId || field.entityTypeId } : field);
  const compatible = existing && compatibleFields(existing.fields, comparableFields);
  proposals.push(compatible ? entityType(existing.code, existing.name, existing.description, clone(existing.fields)) : proposal);
  decisions.push(decision(proposal.name, !existing ? 'CREATE' : compatible ? 'REUSE' : 'CONFLICT', proposal.ref, !existing ? reason : compatible ? `The Workspace already has a compatible ${existing.name} Entity Type.` : `The existing ${existing.code} schema has incompatible semantics and cannot be reused or overwritten.`));
}
function addModule(proposal, reason, proposals, decisions) { proposals.push(proposal); decisions.push(decision(proposal.name, 'CREATE', proposal.ref, reason)); }

function employeeLeaveEvolution(model) {
  const entityTypes = []; const decisions = [];
  [['EMPLOYEE', 'Employee', 'Leave requests reference the existing Employee identity.']].forEach(([code, concept, reason]) => reuseEntity(model, code, concept, reason, entityTypes, decisions));
  const existing = existingModuleProposal(model, 'EMPLOYEE_HOLIDAY_REQUEST');
  const proposal = existing || moduleProposal('EMPLOYEE_HOLIDAY_REQUEST', 'Employee Holiday Request', 'HR', [entityRef('employee', 'Employee', 'EMPLOYEE'), dateRange('period', 'Holiday Period', true), textarea('reason', 'Reason'), select('status', 'Status', ['REQUESTED', 'APPROVED', 'REJECTED'], true)], 'A holiday request is a bounded date-range process. One date-range field captures the inclusive From/Till period.');
  decisions.push(decision('Employee holiday request', existing ? 'REUSE' : 'CREATE', proposal.ref, proposal.rationale));
  return { scenario: 'EMPLOYEE_LEAVE', businessAreas: [area('HR', 'Human Resources')], entityTypes, modules: [proposal], worksets: [workset('HR_OPERATIONS', 'HR Operations', ['EMPLOYEE_HOLIDAY_REQUEST'])], widgets: [], reports: [report('HOLIDAY_REQUEST_SUMMARY', 'Holiday Request Summary', 'EMPLOYEE_HOLIDAY_REQUEST')], decisions, questions: [], warnings: [] };
}

function bookingEvolution(model) {
  const entityTypes = []; const decisions = [];
  [['CUSTOMER', 'Customers', 'Bookings reference existing Customer identity.'], ['EMPLOYEE', 'Employees', 'Service providers are Employee roles.']].forEach(([code, concept, reason]) => reuseEntity(model, code, concept, reason, entityTypes, decisions));
  const existing = existingModuleProposal(model, 'APPOINTMENT');
  const proposal = existing || moduleProposal('APPOINTMENT', 'Appointment', 'OPERATIONS', [entityRef('customer', 'Customer', 'CUSTOMER', true), entityRef('employee', 'Employee', 'EMPLOYEE', false), text('subject', 'Subject', false), datetimeRange('appointmentTime', 'Appointment Time', true), textarea('notes', 'Notes')], 'An appointment is a single timed interval captured as one datetime-range field.');
  decisions.push(decision('Appointment booking', existing ? 'REUSE' : 'CREATE', proposal.ref, proposal.rationale));
  return { scenario: 'BOOKING', businessAreas: [area('OPERATIONS', 'Operations')], entityTypes, modules: [proposal], worksets: [], widgets: [], reports: [report('APPOINTMENT_SUMMARY', 'Appointment Summary', 'APPOINTMENT')], decisions, questions: [], warnings: [] };
}

function restaurantEvolution(model) {
  const entityTypes = []; const modules = []; const decisions = [];
  [['EMPLOYEE', 'Waiters and restaurant staff', 'Restaurant staff are employee roles.'], ['CUSTOMER', 'Restaurant guests', 'Restaurant guests reuse canonical customer identity.'], ['SUPPLIER', 'Food vendors', 'Food vendors are suppliers.'], ['LOCATION', 'Restaurant location', 'The physical restaurant site reuses Location.'], ['EQUIPMENT', 'Restaurant equipment', 'Restaurant assets reuse Equipment.']].forEach(([code, concept, reason]) => reuseEntity(model, code, concept, reason, entityTypes, decisions));
  addEntity(entityType('TABLE', 'Table', 'Persistent restaurant table identity', [text('tableNumber', 'Table number', true), text('area', 'Area'), { key: 'capacity', label: 'Capacity', type: 'number', required: false }, select('operationalStatus', 'Operational status', ['AVAILABLE', 'OCCUPIED', 'OUT_OF_SERVICE'], true)]), 'Tables have persistent identity and are reused by reservations and orders.', entityTypes, decisions, model);
  addEntity(entityType('PRODUCT', 'Product', 'Inventory product identity', [text('sku', 'SKU', true), text('name', 'Name', true), text('unit', 'Unit', true), bool('active', 'Active')]), 'Products persist across receipts, transfers, counts and waste.', entityTypes, decisions, model);
  addEntity(entityType('STORAGE_LOCATION', 'Storage Location', 'Inventory storage location identity', [text('code', 'Code', true), text('name', 'Name', true), entityRef('location', 'Physical location', 'LOCATION', false)]), 'Inventory locations need stock-specific persistent identity beyond the general physical Location.', entityTypes, decisions, model);
  const moduleSpecs = [
    moduleProposal('TABLE_RESERVATION', 'Table Reservation', 'RESTAURANT', [entityRef('table', 'Table', 'TABLE'), entityRef('customer', 'Customer', 'CUSTOMER', false), datetime('startDateTime', 'Start date and time', true), datetime('endDateTime', 'End date and time', true), { key: 'partySize', label: 'Party size', type: 'number', required: true }, textarea('notes', 'Notes')], 'Table reservation is a time-based process, not an Entity Type.'),
    moduleProposal('CUSTOMER_ORDER', 'Customer Order', 'RESTAURANT', [entityRef('table', 'Table', 'TABLE', false), entityRef('customer', 'Customer', 'CUSTOMER', false), entityRef('employee', 'Employee', 'EMPLOYEE'), datetime('orderDateTime', 'Order date and time', true), textarea('items', 'Order items', true), select('orderStatus', 'Order status', ['OPEN', 'SERVED', 'CANCELLED'], true)], 'Orders are business transactions represented by Records.'),
    moduleProposal('GOODS_RECEIPT', 'Goods Receipt', 'INVENTORY', [entityRef('supplier', 'Supplier', 'SUPPLIER'), entityRef('product', 'Product', 'PRODUCT'), entityRef('storageLocation', 'Storage location', 'STORAGE_LOCATION'), date('receiptDate', 'Receipt date', true), { key: 'quantity', label: 'Quantity', type: 'number', required: true }], 'Goods receipts are inventory events.'),
    moduleProposal('STOCK_TRANSFER', 'Stock Transfer', 'INVENTORY', [entityRef('product', 'Product', 'PRODUCT'), entityRef('fromLocation', 'From storage location', 'STORAGE_LOCATION'), entityRef('toLocation', 'To storage location', 'STORAGE_LOCATION'), date('transferDate', 'Transfer date', true), { key: 'quantity', label: 'Quantity', type: 'number', required: true }], 'Stock transfers are movement events.'),
    moduleProposal('STOCK_COUNT', 'Stock Count', 'INVENTORY', [entityRef('product', 'Product', 'PRODUCT'), entityRef('storageLocation', 'Storage location', 'STORAGE_LOCATION'), date('countDate', 'Count date', true), { key: 'countedQuantity', label: 'Counted quantity', type: 'number', required: true }], 'Stock counts are observations recorded over time.'),
    moduleProposal('WASTE_SPOILAGE', 'Waste / Spoilage', 'INVENTORY', [entityRef('product', 'Product', 'PRODUCT'), entityRef('storageLocation', 'Storage location', 'STORAGE_LOCATION'), date('reportedDate', 'Reported date', true), { key: 'quantity', label: 'Quantity', type: 'number', required: true }, textarea('reason', 'Reason', true)], 'Waste and spoilage are operational events.'),
  ];
  moduleSpecs.forEach((proposal) => { const existing = existingModuleProposal(model, proposal.moduleCode); if (existing) { modules.push(existing); decisions.push(decision(proposal.name, 'REUSE', existing.ref, `The Workspace already has a semantically equivalent ${existing.name} Module.`)); } else addModule(proposal, proposal.rationale, modules, decisions); });
  return { scenario: 'RESTAURANT_EXPANSION', businessAreas: [area('RESTAURANT', 'Restaurant Operations'), area('INVENTORY', 'Inventory')], entityTypes, modules, worksets: [workset('RESTAURANT_OPERATIONS', 'Restaurant Operations', ['TABLE_RESERVATION', 'CUSTOMER_ORDER']), workset('INVENTORY', 'Inventory', ['GOODS_RECEIPT', 'STOCK_TRANSFER', 'STOCK_COUNT', 'WASTE_SPOILAGE'])], widgets: [widget('OPEN_ORDERS', 'Open Orders', 'CUSTOMER_ORDER'), widget('STOCK_ACTIVITY', 'Stock Activity', 'STOCK_TRANSFER')], reports: [report('DAILY_ORDERS', 'Daily Orders', 'CUSTOMER_ORDER'), report('STOCK_MOVEMENT_SUMMARY', 'Stock Movement Summary', 'STOCK_TRANSFER')], decisions, questions: [{ code: 'SHIFT_SCHEDULING', category: 'OPTIONAL_REFINEMENT', question: 'Do you also need staff shift scheduling in a future milestone?' }], warnings: [] };
}

function roomInspectionEvolution(model) {
  const entityTypes = []; const decisions = [];
  reuseEntity(model, 'ROOM', 'Room', 'Inspections reference the existing persistent Room identity.', entityTypes, decisions);
  reuseEntity(model, 'EMPLOYEE', 'Inspector', 'An inspector is an Employee role.', entityTypes, decisions);
  const existing = existingModuleProposal(model, 'ROOM_INSPECTION');
  const proposal = existing || moduleProposal('ROOM_INSPECTION', 'Room Inspection', 'HOUSEKEEPING', [entityRef('room', 'Room', 'ROOM'), entityRef('inspector', 'Inspector', 'EMPLOYEE'), date('inspectionDate', 'Inspection date', true), select('condition', 'Condition', ['PASS', 'ATTENTION_REQUIRED', 'OUT_OF_SERVICE'], true), textarea('issues', 'Issues or damage'), textarea('notes', 'Notes')], 'Room inspection is a process producing Records, not a persistent object type.');
  decisions.push(decision('Room inspection', existing ? 'REUSE' : 'CREATE', proposal.ref, proposal.rationale));
  return { scenario: 'ROOM_INSPECTION', businessAreas: [area('HOUSEKEEPING', 'Housekeeping')], entityTypes, modules: [proposal], worksets: [workset('ROOM_OPERATIONS', 'Room Operations', ['ROOM_INSPECTION'])], widgets: [], reports: [report('ROOM_INSPECTION_SUMMARY', 'Room Inspection Summary', 'ROOM_INSPECTION')], decisions, questions: [], warnings: [] };
}

function vehicleEvolution(model) {
  const entityTypes = []; const decisions = [];
  [['VEHICLE', 'Company vehicles', 'Company cars reuse Vehicle.'], ['EMPLOYEE', 'Drivers and inspectors', 'Drivers and inspectors are Employee roles.'], ['EQUIPMENT', 'Vehicle equipment', 'Tools and installed assets may reuse Equipment.']].forEach(([code, concept, reason]) => reuseEntity(model, code, concept, reason, entityTypes, decisions));
  const inspection = existingModuleProposal(model, 'VEHICLE_INSPECTION') || moduleProposal('VEHICLE_INSPECTION', 'Vehicle Inspection', 'FLEET', [entityRef('vehicle', 'Vehicle', 'VEHICLE'), entityRef('inspector', 'Inspector', 'EMPLOYEE'), date('inspectionDate', 'Inspection date', true), select('condition', 'Condition', ['PASS', 'REPAIR_REQUIRED', 'UNSAFE'], true), textarea('issues', 'Issues')], 'Vehicle inspection is a recurring process.');
  decisions.push(decision('Vehicle inspection', model.modules.some((item) => item.moduleCode === 'VEHICLE_INSPECTION') ? 'REUSE' : 'CREATE', inspection.ref, inspection.rationale));
  const maintenance = existingModuleProposal(model, 'MAINTENANCE');
  const modules = [inspection];
  if (maintenance) { modules.push(maintenance); decisions.push(decision('Vehicle maintenance', 'REUSE', maintenance.ref, 'The existing Maintenance Request process can track vehicle maintenance without fragmentation.')); }
  return { scenario: 'VEHICLE_OPERATIONS', businessAreas: [area('FLEET', 'Fleet Operations')], entityTypes, modules, worksets: [workset('FLEET_OPERATIONS', 'Fleet Operations', modules.map((item) => item.moduleCode))], widgets: [], reports: [report('VEHICLE_INSPECTION_SUMMARY', 'Vehicle Inspection Summary', 'VEHICLE_INSPECTION')], decisions, questions: [], warnings: [] };
}

function schoolEvolution(model) {
  const entityTypes = []; const decisions = [];
  [['EQUIPMENT', 'School equipment', 'School equipment reuses Equipment.'], ['EMPLOYEE', 'Teachers and staff', 'Staff roles reuse Employee.'], ['LOCATION', 'School locations', 'General school sites reuse Location.']].forEach(([code, concept, reason]) => reuseEntity(model, code, concept, reason, entityTypes, decisions));
  if (!reuseEntity(model, 'CLASSROOM', 'Classroom', 'The Workspace already has Classroom identity.', entityTypes, decisions)) addEntity(entityType('CLASSROOM', 'Classroom', 'Persistent classroom identity', [text('code', 'Code', true), text('name', 'Name', true), { key: 'capacity', label: 'Capacity', type: 'number', required: false }]), 'Classrooms persist across inspections and activities.', entityTypes, decisions, model);
  if (!reuseEntity(model, 'STUDENT', 'Student', 'The Workspace already has Student identity.', entityTypes, decisions)) addEntity(entityType('STUDENT', 'Student', 'Persistent student identity', [text('studentNumber', 'Student number', true), text('name', 'Name', true)]), 'No existing Core concept safely represents school enrollment identity.', entityTypes, decisions);
  const requestedModules = [moduleProposal('EQUIPMENT_INSPECTION', 'Equipment Inspection', 'FACILITIES', [entityRef('equipment', 'Equipment', 'EQUIPMENT'), entityRef('inspector', 'Inspector', 'EMPLOYEE'), date('inspectionDate', 'Inspection date', true), select('condition', 'Condition', ['PASS', 'REPAIR_REQUIRED', 'UNSAFE'], true)], 'Equipment inspection is a process.'), moduleProposal('STUDENT_ABSENCE', 'Student Absence', 'ATTENDANCE', [entityRef('student', 'Student', 'STUDENT'), date('absenceDate', 'Absence date', true), textarea('reason', 'Reason'), bool('excused', 'Excused')], 'Student absence is an event Record.')];
  const modules = requestedModules.map((item) => existingModuleProposal(model, item.moduleCode) || item);
  modules.forEach((item) => decisions.push(decision(item.name, model.modules.some((candidate) => candidate.moduleCode === item.moduleCode) ? 'REUSE' : 'CREATE', item.ref, item.rationale)));
  return { scenario: 'SCHOOL_OPERATIONS', businessAreas: [area('FACILITIES', 'Facilities'), area('ATTENDANCE', 'Attendance')], entityTypes, modules, worksets: [], widgets: [], reports: [], decisions, questions: [], warnings: [] };
}

function installationEvolution(model) {
  const entityTypes = []; const decisions = [];
  [['CUSTOMER', 'Clients', 'Clients reuse Customer.'], ['VEHICLE', 'Company vehicles', 'Company cars reuse Vehicle.'], ['EQUIPMENT', 'Tools', 'Tools are covered by Equipment unless specialized semantics are later required.'], ['EMPLOYEE', 'Installers', 'Installers are Employee roles.'], ['LOCATION', 'Customer sites', 'Physical sites reuse Location.']].forEach(([code, concept, reason]) => reuseEntity(model, code, concept, reason, entityTypes, decisions));
  const requestedModules = [moduleProposal('CUSTOMER_JOB', 'Customer Job', 'FIELD_SERVICE', [entityRef('customer', 'Customer', 'CUSTOMER'), entityRef('site', 'Site', 'LOCATION'), entityRef('employee', 'Assigned employee', 'EMPLOYEE'), date('dueDate', 'Due date', true), textarea('scope', 'Job scope', true)], 'A customer job is a process tracked by Records.'), moduleProposal('SITE_VISIT', 'Site Visit', 'FIELD_SERVICE', [entityRef('customer', 'Customer', 'CUSTOMER'), entityRef('site', 'Site', 'LOCATION'), entityRef('employee', 'Employee', 'EMPLOYEE'), datetime('appointmentDateTime', 'Appointment date and time', true), textarea('notes', 'Visit notes')], 'A site visit is a scheduled business event.'), moduleProposal('EQUIPMENT_INSPECTION', 'Equipment Inspection', 'FIELD_SERVICE', [entityRef('equipment', 'Equipment', 'EQUIPMENT'), entityRef('inspector', 'Inspector', 'EMPLOYEE'), date('inspectionDate', 'Inspection date', true), select('condition', 'Condition', ['PASS', 'REPAIR_REQUIRED', 'UNSAFE'], true)], 'Equipment inspection is a process.')];
  const modules = requestedModules.map((item) => existingModuleProposal(model, item.moduleCode) || item);
  modules.forEach((item) => decisions.push(decision(item.name, model.modules.some((candidate) => candidate.moduleCode === item.moduleCode) ? 'REUSE' : 'CREATE', item.ref, item.rationale)));
  return { scenario: 'INSTALLATION_OPERATIONS', businessAreas: [area('FIELD_SERVICE', 'Field Service')], entityTypes, modules, worksets: [workset('FIELD_SERVICE', 'Field Service', modules.map((item) => item.moduleCode))], widgets: [], reports: [], decisions, questions: [], warnings: [] };
}

export function architectWorkspaceEvolution({ businessRequest, semanticModel }) {
  if (!semanticModel || semanticModel.schemaVersion !== WORKSPACE_ARCHITECT_SCHEMA_VERSION) throw new Error('WorkspaceSemanticModel is invalid');
  if (semanticModel.completeness.status === 'ANALYSIS_INCOMPLETE') return { schemaVersion: WORKSPACE_ARCHITECT_SCHEMA_VERSION, status: 'ANALYSIS_INCOMPLETE', scenario: 'INCOMPLETE', requestedChange: businessRequest, currentState: { analyzedResources: 0 }, reuse: [], create: [], connect: [], conflicts: [], unsupported: [], capabilityRequirements: [], questions: [{ code: 'ANALYSIS_BOUNDS', category: 'REQUIRED_CLARIFICATION', question: `Workspace analysis exceeded bounded context: ${semanticModel.completeness.truncatedKinds.join(', ')}.` }], warnings: [{ code: 'ANALYSIS_INCOMPLETE', message: 'No evolution is proposed until complete bounded coverage is available.' }], decisions: [], businessAreas: [], entityTypes: [], modules: [], worksets: [], widgets: [], reports: [] };
  const scenario = classifyBusinessRequest(businessRequest);
  if (scenario === 'AMBIGUOUS_STORAGE' || scenario === 'UNSUPPORTED_REQUEST') return { schemaVersion: WORKSPACE_ARCHITECT_SCHEMA_VERSION, status: 'NEEDS_CLARIFICATION', scenario, requestedChange: businessRequest, currentState: { analyzedResources: semanticModel.entityTypes.length + semanticModel.modules.length + semanticModel.worksets.length + semanticModel.widgets.length + semanticModel.reports.length }, reuse: [], create: [], connect: [], conflicts: [], unsupported: [], capabilityRequirements: [], questions: [{ code: scenario, category: 'REQUIRED_CLARIFICATION', question: scenario === 'AMBIGUOUS_STORAGE' ? 'Does storage mean inventory locations, physical rooms, documents, or files?' : 'Please describe the persistent business objects and operational processes involved.' }], warnings: [], decisions: [], businessAreas: [], entityTypes: [], modules: [], worksets: [], widgets: [], reports: [] };
  const planned = scenario === 'EMPLOYEE_LEAVE' ? employeeLeaveEvolution(semanticModel) : scenario === 'BOOKING' ? bookingEvolution(semanticModel) : scenario === 'RESTAURANT_EXPANSION' ? restaurantEvolution(semanticModel) : scenario === 'ROOM_INSPECTION' ? roomInspectionEvolution(semanticModel) : scenario === 'VEHICLE_OPERATIONS' ? vehicleEvolution(semanticModel) : scenario === 'SCHOOL_OPERATIONS' ? schoolEvolution(semanticModel) : installationEvolution(semanticModel);
  planned.worksets.forEach((item) => planned.decisions.push(decision(item.name, semanticModel.worksets.some((existing) => existing.name === item.name) ? 'REUSE' : 'CREATE', item.ref, 'Operational context grouping; authorization remains unchanged.')));
  planned.widgets.forEach((item) => planned.decisions.push(decision(item.name, semanticModel.widgets.some((existing) => existing.name === item.name) ? 'REUSE' : 'CREATE', item.ref, 'Bounded operational visibility over canonical Records.')));
  planned.reports.forEach((item) => planned.decisions.push(decision(item.name, semanticModel.reports.some((existing) => existing.name === item.name) ? 'REUSE' : 'CREATE', item.ref, 'Bounded reporting over canonical Records.')));
  const refs = [...planned.entityTypes, ...planned.modules, ...planned.worksets, ...planned.widgets, ...planned.reports].map((item) => item.ref);
  const calendar = semanticModel.capabilityCatalog.find((item) => item.engineId === 'calendar');
  const calendarSourceModule = scenario === 'EMPLOYEE_LEAVE' ? 'module:EMPLOYEE_HOLIDAY_REQUEST' : scenario === 'BOOKING' ? 'module:APPOINTMENT' : scenario === 'RESTAURANT_EXPANSION' ? 'module:TABLE_RESERVATION' : null;
  const capabilityRequirements = calendarSourceModule && calendar ? [{ engineId: calendar.engineId, contractVersion: calendar.contractVersion, availability: calendar.availability, sourceRef: calendarSourceModule, reason: calendar.availability === 'AVAILABLE' ? `${calendarSourceModule.replace('module:', '')} has canonical start/end fields suitable for a Calendar projection.` : `${calendarSourceModule.replace('module:', '')} has canonical start/end fields suitable for a future Calendar projection.`, operational: calendar.operational }] : [];
  return { schemaVersion: WORKSPACE_ARCHITECT_SCHEMA_VERSION, status: 'READY_FOR_REVIEW', scenario, requestedChange: businessRequest, currentState: { analyzedResources: semanticModel.entityTypes.length + semanticModel.modules.length + semanticModel.worksets.length + semanticModel.widgets.length + semanticModel.reports.length }, reuse: planned.decisions.filter((item) => item.decision === 'REUSE').map((item) => item.targetRef), create: planned.decisions.filter((item) => item.decision === 'CREATE').map((item) => item.targetRef), connect: planned.modules.flatMap((item) => item.formSchema.fields.filter((field) => field.type === 'entity-reference').map((field) => ({ moduleRef: item.ref, fieldKey: field.key, entityTypeRef: field.entityTypeId }))), conflicts: planned.decisions.filter((item) => item.decision === 'CONFLICT').map((item) => item.targetRef), unsupported: [], questions: planned.questions, warnings: planned.warnings, capabilityRequirements, decisions: planned.decisions, businessAreas: planned.businessAreas, entityTypes: planned.entityTypes, modules: planned.modules, worksets: planned.worksets, widgets: planned.widgets, reports: planned.reports, refs };
}

export function compileEvolutionBuildPlan({ evolution, requestId, workspaceId, requestedBy, execution }) {
  const processes = evolution.modules.map((item) => process(item.moduleCode, item.name, item.category));
  const domainObjects = evolution.entityTypes.map((item) => ({ objectRef: `domainObject:${item.code}`, code: item.code, name: item.name, classification: evolution.reuse.includes(item.ref) ? 'REUSE' : 'DOMAIN_ENTITY', rationale: evolution.decisions.find((decisionItem) => decisionItem.targetRef === item.ref)?.reason || item.description, entityTypeRef: item.ref, coreEntityCode: null }));
  return { planId: `plan:${requestId}`, planVersion: '1.0.0', status: 'READY_FOR_REVIEW', workspaceId, source: { requestedBy, requestId, agentExecutions: [execution.requestId] }, organizationProfile: { organizationType: 'Existing Workspace', industry: 'Workspace Evolution', subIndustry: evolution.scenario, operatingModel: 'Existing Workspace evolution', country: null, size: null, employeeCount: null, locations: [], facilities: [], assets: [], services: [], customerTypes: [], supplierTypes: [], operationalCharacteristics: [], regulatoryCharacteristics: [], terminology: [], assumptions: ['No operational Entity instances or Records will be generated.'], missingInformation: [], warnings: [] }, industryAnalysis: { knowledgeCode: evolution.scenario, industry: 'Workspace Evolution', organizationType: 'Existing Workspace', rationale: 'Analyzed bounded canonical Workspace configuration before proposing evolution.' }, businessAreas: evolution.businessAreas, domainObjects, processes, capabilities: [], proposedEntityTypes: evolution.entityTypes, proposedModules: evolution.modules, proposedRelationships: [], proposedWorksets: evolution.worksets, proposedWidgets: evolution.widgets, proposedReports: evolution.reports, architectDecisions: evolution.decisions, capabilityRequirements: evolution.capabilityRequirements, evolutionSummary: { schemaVersion: evolution.schemaVersion, status: evolution.status, requestedChange: evolution.requestedChange, analyzedResources: evolution.currentState.analyzedResources, reuse: evolution.reuse, create: evolution.create, connect: evolution.connect }, warnings: evolution.warnings, unresolvedQuestions: evolution.questions, validation: null, provenance: { contractVersion: '1.0.0', generatedBy: [{ agentCode: execution.agentCode, agentVersion: execution.agentVersion, requestId: execution.requestId, providerAdapter: execution.provenance.providerAdapter }] } };
}

export function assertEvolutionSafety(evolution) {
  const serialized = JSON.stringify(evolution);
  if (/DELETE_|REPLACE_DELETE|createEntity\b|createRecord\b/.test(serialized)) throw new Error('Evolution plan contains destructive or operational-data actions');
  if ((evolution.entityTypes || []).length > AUTOMAT_BOUNDS.MAX_ENTITY_TYPES || (evolution.modules || []).length > AUTOMAT_BOUNDS.MAX_MODULES) throw new Error('Evolution plan exceeds BuildPlan bounds');
  return true;
}
