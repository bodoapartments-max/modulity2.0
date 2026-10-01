/**
 * Modulity 2.0 — Demo Module Definitions
 *
 * Deterministic proof-of-concept modules:
 *   - ROOM_INSPECTION: text, select, date, textarea, entity-reference, file-reference
 *   - VEHICLE_INSPECTION: text, number, date, boolean, select, textarea
 *
 * These are NOT industry-specific hotel applications.
 * They are generic proof fixtures demonstrating schema-driven Form rendering
 * and canonical Record creation.
 *
 * @module modules/demoModules
 */

export const ROOM_INSPECTION_SCHEMA = Object.freeze({
  schemaVersion: '1.0.0',
  fields: [
    {
      key: 'room',
      label: 'Room',
      type: 'entity-reference',
      required: true,
      entityTypeId: 'ROOM',
      helpText: 'Select the room to inspect',
    },
    {
      key: 'inspectionDate',
      label: 'Inspection Date',
      type: 'date',
      required: true,
    },
    {
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      options: ['GOOD', 'NEEDS_ATTENTION', 'OUT_OF_SERVICE'],
    },
    {
      key: 'notes',
      label: 'Notes',
      type: 'textarea',
      required: false,
      placeholder: 'Any additional notes about the inspection...',
    },
    {
      key: 'photoRef',
      label: 'Photo Reference',
      type: 'file-reference',
      required: false,
      helpText: 'Reference to inspection photo (upload deferred)',
    },
  ],
});

export const VEHICLE_INSPECTION_SCHEMA = Object.freeze({
  schemaVersion: '1.0.0',
  fields: [
    {
      key: 'vehicleId',
      label: 'Vehicle Identifier',
      type: 'text',
      required: true,
      placeholder: 'e.g., VAN-001',
    },
    {
      key: 'inspectionDate',
      label: 'Inspection Date',
      type: 'date',
      required: true,
    },
    {
      key: 'mileage',
      label: 'Current Mileage (km)',
      type: 'number',
      required: true,
      min: 0,
    },
    {
      key: 'fuelLevel',
      label: 'Fuel Level',
      type: 'select',
      required: true,
      options: [
        { value: 'FULL', label: 'Full' },
        { value: 'THREE_QUARTERS', label: '3/4' },
        { value: 'HALF', label: '1/2' },
        { value: 'ONE_QUARTER', label: '1/4' },
        { value: 'EMPTY', label: 'Empty' },
      ],
    },
    {
      key: 'exteriorClean',
      label: 'Exterior Clean',
      type: 'boolean',
      required: false,
    },
    {
      key: 'interiorClean',
      label: 'Interior Clean',
      type: 'boolean',
      required: false,
    },
    {
      key: 'overallCondition',
      label: 'Overall Condition',
      type: 'select',
      required: true,
      options: ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'UNSAFE'],
    },
    {
      key: 'notes',
      label: 'Notes',
      type: 'textarea',
      required: false,
      placeholder: 'Damage, maintenance needs, etc.',
    },
  ],
});

/**
 * Seed demo modules into a workspace.
 *
 * @param {Object} moduleService — the wired ModuleService
 * @param {string} workspaceId
 * @param {Object} actor — ActorRef
 * @returns {Promise<Object[]>} — created modules
 */
export async function seedDemoModules(moduleService, workspaceId, actor) {
  const results = [];

  // Only create if they don't already exist
  const existingRoom = await moduleService.getModuleByCode(workspaceId, 'ROOM_INSPECTION');
  if (!existingRoom) {
    const room = await moduleService.createModule({
      workspaceId,
      moduleCode: 'ROOM_INSPECTION',
      name: 'Room Inspection',
      description: 'Inspect a room and record its condition',
      category: 'Operations',
      formSchema: ROOM_INSPECTION_SCHEMA,
      createdBy: actor,
    });
    results.push(room);
  }

  const existingVehicle = await moduleService.getModuleByCode(workspaceId, 'VEHICLE_INSPECTION');
  if (!existingVehicle) {
    const vehicle = await moduleService.createModule({
      workspaceId,
      moduleCode: 'VEHICLE_INSPECTION',
      name: 'Vehicle Inspection',
      description: 'Pre-trip vehicle inspection checklist',
      category: 'Operations',
      formSchema: VEHICLE_INSPECTION_SCHEMA,
      createdBy: actor,
    });
    results.push(vehicle);
  }

  return results;
}
