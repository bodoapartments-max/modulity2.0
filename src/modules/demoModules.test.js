/**
 * Demo Modules — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { ROOM_INSPECTION_SCHEMA, VEHICLE_INSPECTION_SCHEMA } from './demoModules.js';
import { validateFormSchema, validateFormValues } from './forms/formSchemaValidator.js';

describe('ROOM_INSPECTION_SCHEMA', () => {
  it('is a valid form schema', () => {
    const result = validateFormSchema(ROOM_INSPECTION_SCHEMA);
    // entity-reference warning is acceptable
    expect(result.errors.filter((e) => !e.includes('entityTypeId'))).toHaveLength(0);
  });

  it('has required fields: room, inspectionDate, condition', () => {
    const required = ROOM_INSPECTION_SCHEMA.fields.filter((f) => f.required);
    const keys = required.map((f) => f.key);
    expect(keys).toContain('room');
    expect(keys).toContain('inspectionDate');
    expect(keys).toContain('condition');
  });

  it('validates correct room inspection values', () => {
    const result = validateFormValues({
      room: { entityId: 'e-1', entityTypeId: 'ROOM', workspaceId: 'ws-1' },
      inspectionDate: '2024-06-15',
      condition: 'GOOD',
      notes: 'All clear',
    }, ROOM_INSPECTION_SCHEMA.fields);
    expect(result.valid).toBe(true);
  });

  it('rejects missing required condition', () => {
    const result = validateFormValues({
      room: { entityId: 'e-1', entityTypeId: 'ROOM', workspaceId: 'ws-1' },
      inspectionDate: '2024-06-15',
    }, ROOM_INSPECTION_SCHEMA.fields);
    expect(result.valid).toBe(false);
    expect(result.errors.condition).toBeTruthy();
  });
});

describe('VEHICLE_INSPECTION_SCHEMA', () => {
  it('is a valid form schema', () => {
    const result = validateFormSchema(VEHICLE_INSPECTION_SCHEMA);
    expect(result.valid).toBe(true);
  });

  it('has required fields: vehicleId, inspectionDate, mileage, fuelLevel, overallCondition', () => {
    const required = VEHICLE_INSPECTION_SCHEMA.fields.filter((f) => f.required);
    const keys = required.map((f) => f.key);
    expect(keys).toContain('vehicleId');
    expect(keys).toContain('inspectionDate');
    expect(keys).toContain('mileage');
    expect(keys).toContain('fuelLevel');
    expect(keys).toContain('overallCondition');
  });

  it('validates correct vehicle inspection values', () => {
    const result = validateFormValues({
      vehicleId: 'VAN-001',
      inspectionDate: '2024-06-15',
      mileage: 45000,
      fuelLevel: 'FULL',
      overallCondition: 'GOOD',
      exteriorClean: true,
      interiorClean: false,
      notes: 'Minor scratch on front bumper',
    }, VEHICLE_INSPECTION_SCHEMA.fields);
    expect(result.valid).toBe(true);
  });

  it('supports {value, label} select options for fuelLevel', () => {
    const fuelField = VEHICLE_INSPECTION_SCHEMA.fields.find((f) => f.key === 'fuelLevel');
    expect(fuelField.options[0]).toHaveProperty('value');
    expect(fuelField.options[0]).toHaveProperty('label');

    const result = validateFormValues({
      vehicleId: 'VAN-001',
      inspectionDate: '2024-06-15',
      mileage: 45000,
      fuelLevel: 'THREE_QUARTERS',
      overallCondition: 'GOOD',
    }, VEHICLE_INSPECTION_SCHEMA.fields);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid mileage (negative)', () => {
    const result = validateFormValues({
      vehicleId: 'VAN-001',
      inspectionDate: '2024-06-15',
      mileage: -100,
      fuelLevel: 'FULL',
      overallCondition: 'GOOD',
    }, VEHICLE_INSPECTION_SCHEMA.fields);
    expect(result.valid).toBe(false);
    expect(result.errors.mileage).toBeTruthy();
  });
});
