import { describe, expect, it } from 'vitest';
import { createCalendarEngine } from './calendarEngine.js';
import { createCalendarDefinitionV1 } from './calendarDefinitionV1.js';
import { createRecord } from '../data/record.js';
import { RECORD_STATUSES } from '../data/record.js';

const workspaceId = 'ws-cal';

function fakeRecord(overrides = {}) {
  return createRecord({
    recordId: `rec-${Date.now()}-${Math.random()}`,
    workspaceId,
    moduleId: 'mod-1',
    moduleVersion: 1,
    recordType: 'TEST',
    status: RECORD_STATUSES.SUBMITTED,
    createdBy: { actorType: 'USER', actorId: 'user-1' },
    data: {},
    ...overrides,
  });
}

function fakeModule(fields) {
  return {
    moduleId: 'mod-1', workspaceId, moduleCode: 'RESERVATION', status: 'ACTIVE', formSchema: { schemaVersion: '1.0.0', fields },
  };
}

function fakeRepo(records) {
  return {
    query: async () => records,
    listByWorkspace: async () => records,
  };
}

function fakeModuleRepo(mod) {
  return {
    getByCode: async () => mod,
  };
}

function fakeEntityRepo(entities) {
  return {
    getManyByIds: async (_ws, ids) => entities.filter((e) => ids.includes(e.entityId)),
  };
}

describe('Calendar Engine', () => {
  it('projects a single-date event from a Record', async () => {
    const fields = [{ key: 'title', label: 'Title', type: 'text' }, { key: 'on', label: 'On', type: 'date' }];
    const record = fakeRecord({ data: { title: 'Inspection', on: '2026-10-10' } });
    const definition = createCalendarDefinitionV1({ definitionId: 'cal-single', workspaceId, sourceRef: 'module:RESERVATION', mapping: { titleField: 'title', startField: 'on' }, status: 'ACTIVE' });
    const engine = createCalendarEngine({ recordRepo: fakeRepo([record]), moduleRepo: fakeModuleRepo(fakeModule(fields)), entityRepo: fakeEntityRepo([]) });
    const result = await engine.project(definition, { windowStart: '2026-10-01', windowEnd: '2026-10-31' });
    expect(result.ok).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].title).toBe('Inspection');
    expect(result.events[0].start).toBe('2026-10-10');
    expect(result.events[0].end).toBeNull();
    expect(result.events[0].allDay).toBe(true);
  });

  it('projects a date-range event', async () => {
    const fields = [{ key: 'guestName', label: 'Guest', type: 'text' }, { key: 'arrivalDate', label: 'Arrival', type: 'date' }, { key: 'departureDate', label: 'Departure', type: 'date' }];
    const record = fakeRecord({ data: { guestName: 'John Smith', arrivalDate: '2026-10-10', departureDate: '2026-10-14' } });
    const definition = createCalendarDefinitionV1({ definitionId: 'cal-range', workspaceId, sourceRef: 'module:RESERVATION', mapping: { titleField: 'guestName', startField: 'arrivalDate', endField: 'departureDate' }, status: 'ACTIVE' });
    const engine = createCalendarEngine({ recordRepo: fakeRepo([record]), moduleRepo: fakeModuleRepo(fakeModule(fields)), entityRepo: fakeEntityRepo([]) });
    const result = await engine.project(definition, { windowStart: '2026-10-01', windowEnd: '2026-10-31' });
    expect(result.ok).toBe(true);
    expect(result.events[0].end).toBe('2026-10-14');
  });

  it('projects a datetime range event', async () => {
    const fields = [{ key: 'title', label: 'Title', type: 'text' }, { key: 'start', label: 'Start', type: 'datetime' }, { key: 'end', label: 'End', type: 'datetime' }];
    const record = fakeRecord({ data: { title: 'Meeting', start: '2026-10-10T10:00:00Z', end: '2026-10-10T11:00:00Z' } });
    const definition = createCalendarDefinitionV1({ definitionId: 'cal-dt', workspaceId, sourceRef: 'module:RESERVATION', mapping: { titleField: 'title', startField: 'start', endField: 'end' }, status: 'ACTIVE' });
    const engine = createCalendarEngine({ recordRepo: fakeRepo([record]), moduleRepo: fakeModuleRepo(fakeModule(fields)), entityRepo: fakeEntityRepo([]) });
    const result = await engine.project(definition, { windowStart: '2026-10-01', windowEnd: '2026-10-31' });
    expect(result.ok).toBe(true);
    expect(result.events[0].allDay).toBe(false);
  });

  it('resolves EntityReference title labels', async () => {
    const fields = [{ key: 'employee', label: 'Employee', type: 'entity-reference', entityTypeId: 'employee-type' }, { key: 'date', label: 'Date', type: 'date' }];
    const employee = { entityId: 'emp-1', entityTypeId: 'employee-type', workspaceId, displayName: 'Anna Smith' };
    const record = fakeRecord({ data: { employee: { entityId: 'emp-1', entityTypeId: 'employee-type', workspaceId }, date: '2026-10-10' } });
    const definition = createCalendarDefinitionV1({ definitionId: 'cal-title-entity', workspaceId, sourceRef: 'module:RESERVATION', mapping: { titleField: 'employee', startField: 'date' }, status: 'ACTIVE' });
    const engine = createCalendarEngine({ recordRepo: fakeRepo([record]), moduleRepo: fakeModuleRepo(fakeModule(fields)), entityRepo: fakeEntityRepo([employee]) });
    const result = await engine.project(definition, { windowStart: '2026-10-01', windowEnd: '2026-10-31' });
    expect(result.events[0].title).toBe('Anna Smith');
  });

  it('resolves EntityReference resource labels', async () => {
    const fields = [{ key: 'title', label: 'Title', type: 'text' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'room', label: 'Room', type: 'entity-reference', entityTypeId: 'room-type' }];
    const room = { entityId: 'room-1', entityTypeId: 'room-type', workspaceId, displayName: 'Room 102' };
    const record = fakeRecord({ data: { title: 'Reservation', date: '2026-10-10', room: { entityId: 'room-1', entityTypeId: 'room-type', workspaceId } } });
    const definition = createCalendarDefinitionV1({ definitionId: 'cal-resource', workspaceId, sourceRef: 'module:RESERVATION', mapping: { titleField: 'title', startField: 'date', resourceField: 'room' }, status: 'ACTIVE' });
    const engine = createCalendarEngine({ recordRepo: fakeRepo([record]), moduleRepo: fakeModuleRepo(fakeModule(fields)), entityRepo: fakeEntityRepo([room]) });
    const result = await engine.project(definition, { windowStart: '2026-10-01', windowEnd: '2026-10-31' });
    expect(result.events[0].resourceLabel).toBe('Room 102');
  });

  it('filters by bounded date window and returns deterministic ordering', async () => {
    const fields = [{ key: 'title', label: 'Title', type: 'text' }, { key: 'on', label: 'On', type: 'date' }];
    const records = [
      fakeRecord({ recordId: 'rec-a', data: { title: 'A', on: '2026-09-01' } }),
      fakeRecord({ recordId: 'rec-b', data: { title: 'B', on: '2026-10-15' } }),
      fakeRecord({ recordId: 'rec-c', data: { title: 'C', on: '2026-10-05' } }),
      fakeRecord({ recordId: 'rec-d', data: { title: 'D', on: '2026-11-01' } }),
    ];
    const definition = createCalendarDefinitionV1({ definitionId: 'cal-window', workspaceId, sourceRef: 'module:RESERVATION', mapping: { titleField: 'title', startField: 'on' }, status: 'ACTIVE' });
    const engine = createCalendarEngine({ recordRepo: fakeRepo(records), moduleRepo: fakeModuleRepo(fakeModule(fields)), entityRepo: fakeEntityRepo([]) });
    const result = await engine.project(definition, { windowStart: '2026-10-01', windowEnd: '2026-10-31' });
    expect(result.events.map((e) => e.title)).toEqual(['C', 'B']);
  });

  it('isolates invalid definitions without throwing', async () => {
    const definition = createCalendarDefinitionV1({ definitionId: 'cal-bad', workspaceId, sourceRef: 'module:RESERVATION', mapping: { titleField: 'missing', startField: 'alsoMissing' } });
    const engine = createCalendarEngine({ recordRepo: fakeRepo([]), moduleRepo: fakeModuleRepo(fakeModule([])), entityRepo: fakeEntityRepo([]) });
    const result = await engine.project(definition, {});
    expect(result.ok).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it('combines multiple definitions without duplicating records', async () => {
    const fields = [{ key: 'title', label: 'Title', type: 'text' }, { key: 'on', label: 'On', type: 'date' }];
    const record = fakeRecord({ data: { title: 'Holiday', on: '2026-10-10' } });
    const defA = createCalendarDefinitionV1({ definitionId: 'cal-a', workspaceId, sourceRef: 'module:RESERVATION', mapping: { titleField: 'title', startField: 'on' }, status: 'ACTIVE' });
    const defB = createCalendarDefinitionV1({ definitionId: 'cal-b', workspaceId, sourceRef: 'module:RESERVATION', mapping: { titleField: 'title', startField: 'on' }, status: 'ACTIVE' });
    const engine = createCalendarEngine({ recordRepo: fakeRepo([record]), moduleRepo: fakeModuleRepo(fakeModule(fields)), entityRepo: fakeEntityRepo([]) });
    const result = await engine.projectMultiple([defA, defB], {});
    expect(result.events).toHaveLength(2);
  });
});
