import { describe, expect, it } from 'vitest';
import { createCalendarDefinitionV1, validateCalendarDefinitionV1 } from './calendarDefinitionV1.js';

const workspaceId = 'ws-1';
const source = { formSchema: { fields: [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'period', label: 'Period', type: 'date-range' },
  { key: 'appointmentTime', label: 'Appointment Time', type: 'datetime-range' },
  { key: 'start', label: 'Start', type: 'date' },
  { key: 'end', label: 'End', type: 'date' },
  { key: 'resource', label: 'Resource', type: 'entity-reference' },
] } };

describe('validateCalendarDefinitionV1', () => {
  it('accepts a date-range startField without an endField', () => {
    const def = createCalendarDefinitionV1({ definitionId: 'cal-1', workspaceId, sourceRef: 'module:HOLIDAY', mapping: { titleField: 'title', startField: 'period' }, status: 'ACTIVE' });
    const result = validateCalendarDefinitionV1(def, { source });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('rejects an endField when startField is a date-range', () => {
    const def = createCalendarDefinitionV1({ definitionId: 'cal-1', workspaceId, sourceRef: 'module:HOLIDAY', mapping: { titleField: 'title', startField: 'period', endField: 'end' }, status: 'ACTIVE' });
    const result = validateCalendarDefinitionV1(def, { source });
    expect(result.valid).toBe(false);
    expect(result.issues.some((item) => item.code === 'AMBIGUOUS_RANGE')).toBe(true);
  });

  it('accepts a datetime-range startField without an endField', () => {
    const def = createCalendarDefinitionV1({ definitionId: 'cal-2', workspaceId, sourceRef: 'module:APPOINTMENT', mapping: { titleField: 'title', startField: 'appointmentTime' }, status: 'ACTIVE' });
    const result = validateCalendarDefinitionV1(def, { source });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('rejects an endField when startField is a datetime-range', () => {
    const def = createCalendarDefinitionV1({ definitionId: 'cal-3', workspaceId, sourceRef: 'module:APPOINTMENT', mapping: { titleField: 'title', startField: 'appointmentTime', endField: 'end' }, status: 'ACTIVE' });
    const result = validateCalendarDefinitionV1(def, { source });
    expect(result.valid).toBe(false);
    expect(result.issues.some((item) => item.code === 'AMBIGUOUS_RANGE')).toBe(true);
  });

  it('still accepts separate start/end date fields', () => {
    const def = createCalendarDefinitionV1({ definitionId: 'cal-1', workspaceId, sourceRef: 'module:RESERVATION', mapping: { titleField: 'title', startField: 'start', endField: 'end' }, status: 'ACTIVE' });
    const result = validateCalendarDefinitionV1(def, { source });
    expect(result.valid).toBe(true);
  });
});
