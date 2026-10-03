import { describe, expect, it } from 'vitest';
import { buildModuleRecordColumns, formatRecordListValue } from './recordListPresentation.js';

const moduleDefinition = { displayConfig: { listFields: ['guest', 'room'] }, formSchema: { fields: [{ key: 'room', label: 'Room', type: 'entity-reference' }, { key: 'guest', label: 'Guest', type: 'text' }, { key: 'arrival', label: 'Arrival', type: 'date' }] } };

describe('generic Module Record list presentation', () => {
  it('uses declarative columns and deterministic system columns', () => {
    expect(buildModuleRecordColumns(moduleDefinition).map((item) => item.key)).toEqual(['guest', 'room', 'status', 'createdAt']);
  });

  it('derives safe fallback columns from any Form Schema', () => {
    expect(buildModuleRecordColumns({ formSchema: moduleDefinition.formSchema }).map((item) => item.key)).toEqual(['room', 'guest', 'arrival', 'status', 'createdAt']);
    expect(buildModuleRecordColumns(null).map((item) => item.key)).toEqual(['status', 'createdAt']);
  });

  it('renders canonical EntityReference values through human-readable labels', () => {
    const record = { data: { room: { entityId: 'room-1', entityTypeId: 'ROOM', workspaceId: 'workspace-1' }, guest: 'Test Guest' } };
    expect(formatRecordListValue(record, { key: 'room', scope: 'DATA', type: 'entity-reference' }, { 'room-1': '101' })).toBe('101');
    expect(formatRecordListValue(record, { key: 'room', scope: 'DATA', type: 'entity-reference' }, {})).toBe('room-1');
  });

  it('renders date-range as a localized span', () => {
    const record = { data: { period: { start: '2026-10-12', end: '2026-10-16' } } };
    const value = formatRecordListValue(record, { key: 'period', scope: 'DATA', type: 'date-range' });
    expect(value).toMatch(/12/);
    expect(value).toMatch(/16/);
    expect(value).toMatch(/2026/);
    expect(value).toMatch(/–/);
  });
});
