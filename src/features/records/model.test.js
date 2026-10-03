import { describe, expect, it } from 'vitest';
import {
  getRecordBackNavigation,
  getRecordDisplayLabel,
  getRecordStatusVariant,
  getRecordPriorityVariant,
  formatActorLabel,
  RECORD_SORT_OPTIONS,
  resolveRecordSort,
  filterRecordsBySearch,
  buildRecordCopyValues,
  buildRecordExport,
} from './model.js';

describe('Record navigation context', () => {
  it('returns to the originating generic Module Record List', () => {
    expect(getRecordBackNavigation('reservation', { moduleId: 'reservation', name: 'Reservation' })).toEqual({ to: '/app/modules/reservation/records', label: 'Back to Reservation Records' });
  });

  it('returns to global Records when Module context is absent or mismatched', () => {
    expect(getRecordBackNavigation(null, { moduleId: 'reservation', name: 'Reservation' })).toEqual({ to: '/app/records', label: 'Back to Records' });
    expect(getRecordBackNavigation('other', { moduleId: 'reservation', name: 'Reservation' })).toEqual({ to: '/app/records', label: 'Back to Records' });
  });
});

const fields = [
  { key: 'room', label: 'Room', type: 'entity-reference' },
  { key: 'guest', label: 'Guest', type: 'text' },
  { key: 'arrival', label: 'Arrival', type: 'date' },
];
const moduleDefinition = { moduleId: 'reservation', name: 'Reservation', displayConfig: { primaryField: 'code' }, formSchema: { fields } };

describe('getRecordDisplayLabel', () => {
  it('prefers the configured primary field when non-empty', () => {
    const record = { recordId: 'r-1', data: { code: 'RES-42', guest: 'Guest A' } };
    expect(getRecordDisplayLabel(record, fields, moduleDefinition)).toBe('RES-42');
  });

  it('falls back to the first text-like schema field', () => {
    const record = { recordId: 'r-1', data: { guest: '  Guest A  ' } };
    expect(getRecordDisplayLabel(record, fields, moduleDefinition)).toBe('Guest A');
  });

  it('skips non-string and empty values', () => {
    const record = { recordId: 'r-1', data: { code: 7, guest: '' } };
    expect(getRecordDisplayLabel(record, fields, moduleDefinition)).toBe('7');
    const empty = { recordId: 'r-1', data: { guest: '   ' } };
    expect(getRecordDisplayLabel(empty, fields, moduleDefinition)).toBe('Reservation · r-1');
  });

  it('truncates labels beyond 80 characters', () => {
    const long = 'x'.repeat(100);
    const record = { recordId: 'r-1', data: { guest: long } };
    expect(getRecordDisplayLabel(record, fields, moduleDefinition)).toBe(`${'x'.repeat(80)}…`);
  });

  it('falls back to recordType and short recordId', () => {
    const record = { recordId: 'abcdef12-3456', recordType: 'GENERIC', data: {} };
    expect(getRecordDisplayLabel(record, fields, null)).toBe('GENERIC · abcdef12');
    expect(getRecordDisplayLabel({ recordId: 'abcdef12-3456', data: {} }, [], null)).toBe('Record · abcdef12');
  });

  it('does not mutate the record', () => {
    const record = { recordId: 'r-1', data: { guest: 'Guest A' } };
    getRecordDisplayLabel(record, fields, moduleDefinition);
    expect(record).toEqual({ recordId: 'r-1', data: { guest: 'Guest A' } });
  });
});

describe('getRecordStatusVariant', () => {
  it('maps each canonical status', () => {
    expect(getRecordStatusVariant('DRAFT')).toBe('default');
    expect(getRecordStatusVariant('SUBMITTED')).toBe('info');
    expect(getRecordStatusVariant('ACTIVE')).toBe('success');
    expect(getRecordStatusVariant('COMPLETED')).toBe('success');
    expect(getRecordStatusVariant('CANCELLED')).toBe('danger');
    expect(getRecordStatusVariant('ARCHIVED')).toBe('default');
    expect(getRecordStatusVariant('UNKNOWN')).toBe('default');
  });
});

describe('getRecordPriorityVariant', () => {
  it('maps priorities and returns null for missing priority', () => {
    expect(getRecordPriorityVariant('LOW')).toBe('default');
    expect(getRecordPriorityVariant('MEDIUM')).toBe('info');
    expect(getRecordPriorityVariant('HIGH')).toBe('warning');
    expect(getRecordPriorityVariant('CRITICAL')).toBe('danger');
    expect(getRecordPriorityVariant(null)).toBeNull();
    expect(getRecordPriorityVariant(undefined)).toBeNull();
  });
});

describe('formatActorLabel', () => {
  it('handles missing actors and the current user', () => {
    expect(formatActorLabel(null, 'u-1')).toBe('—');
    expect(formatActorLabel(undefined, 'u-1')).toBe('—');
    expect(formatActorLabel({ actorType: 'USER', actorId: 'u-1' }, 'u-1')).toBe('You');
  });

  it('truncates other user IDs and labels agents/integrations', () => {
    expect(formatActorLabel({ actorType: 'USER', actorId: 'abcdef12-3456' }, 'u-1')).toBe('User abcdef12');
    expect(formatActorLabel({ actorType: 'INTERNAL_AGENT', actorId: 'agent-1' }, 'u-1')).toBe('Agent');
    expect(formatActorLabel({ actorType: 'EXTERNAL_INTEGRATION', actorId: 'int-1' }, 'u-1')).toBe('Integration');
    expect(formatActorLabel({ actorType: 'OTHER', actorId: 'x' }, 'u-1')).toBe('—');
  });
});

describe('resolveRecordSort', () => {
  it('resolves whitelisted sort values', () => {
    expect(resolveRecordSort('oldest')).toEqual({ value: 'oldest', label: 'Oldest first', sortField: 'createdAt', sortDirection: 'asc' });
    expect(resolveRecordSort('updated').sortField).toBe('updatedAt');
    expect(resolveRecordSort('newest')).toBe(RECORD_SORT_OPTIONS[0]);
  });

  it('falls back to newest for unknown input', () => {
    expect(resolveRecordSort('garbage; DROP')).toBe(RECORD_SORT_OPTIONS[0]);
    expect(resolveRecordSort('')).toBe(RECORD_SORT_OPTIONS[0]);
    expect(resolveRecordSort(null)).toBe(RECORD_SORT_OPTIONS[0]);
  });
});

describe('filterRecordsBySearch', () => {
  const records = [
    { recordId: 'rec-aaa', recordType: 'RESERVATION', referenceNumber: 'L-001', data: { guest: 'Alice' } },
    { recordId: 'rec-bbb', recordType: 'VEHICLE', data: { plate: 'ABC-123' } },
  ];
  const labelFor = (record) => `Label ${record.recordId}`;

  it('returns records unchanged for empty terms', () => {
    expect(filterRecordsBySearch(records, '  ', labelFor)).toBe(records);
    expect(filterRecordsBySearch(records, '', labelFor)).toBe(records);
  });

  it('matches label, ids, type, reference, and data values case-insensitively', () => {
    expect(filterRecordsBySearch(records, 'label rec-aaa', labelFor)).toHaveLength(1);
    expect(filterRecordsBySearch(records, 'REC-BBB', labelFor)).toHaveLength(1);
    expect(filterRecordsBySearch(records, 'vehicle', labelFor)).toHaveLength(1);
    expect(filterRecordsBySearch(records, 'l-001', labelFor)).toHaveLength(1);
    expect(filterRecordsBySearch(records, 'alice', labelFor)).toHaveLength(1);
    expect(filterRecordsBySearch(records, 'nomatch', labelFor)).toHaveLength(0);
  });
});

describe('buildRecordCopyValues', () => {
  it('keeps only current schema keys and skips file references and nulls', () => {
    const record = {
      recordId: 'r-1',
      workspaceId: 'ws-1',
      status: 'SUBMITTED',
      createdBy: { actorType: 'USER', actorId: 'u-1' },
      data: {
        guest: 'Guest A',
        attachment: { fileId: 'f-1' },
        extra: 'not in schema',
        empty: null,
      },
    };
    const schema = [
      { key: 'guest', type: 'text' },
      { key: 'attachment', type: 'file-reference' },
      { key: 'missing', type: 'text' },
    ];
    expect(buildRecordCopyValues(record, schema)).toEqual({ guest: 'Guest A' });
  });

  it('clones object values instead of sharing references', () => {
    const range = { start: '2026-10-10', end: '2026-10-12' };
    const record = { recordId: 'r-1', data: { period: range } };
    const copy = buildRecordCopyValues(record, [{ key: 'period', type: 'date-range' }]);
    expect(copy.period).toEqual(range);
    expect(copy.period).not.toBe(range);
  });
});

describe('buildRecordExport', () => {
  it('exports metadata and formatted fields without raw actor data', () => {
    const record = {
      recordId: 'r-1',
      recordType: 'RESERVATION',
      status: 'SUBMITTED',
      priority: 'HIGH',
      moduleId: 'reservation',
      moduleVersion: 2,
      referenceNumber: 'L-001',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-02T10:00:00Z',
      submittedAt: '2026-10-01T11:00:00Z',
      createdBy: { actorType: 'USER', actorId: 'abcdef12-3456' },
      submittedBy: { actorType: 'USER', actorId: 'u-1' },
      entityReferenceIds: ['room-1'],
      data: { guest: 'Guest A', arrival: '2026-10-10' },
    };
    const exportResult = buildRecordExport(record, fields, { moduleName: 'Reservation', currentUserId: 'u-1' });
    expect(exportResult.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(exportResult.record.createdBy).toBe('User abcdef12');
    expect(exportResult.record.submittedBy).toBe('You');
    expect(exportResult.record.moduleName).toBe('Reservation');
    expect(exportResult.record.entityReferenceIds).toBeUndefined();
    expect(exportResult.fields).toHaveLength(3);
    const guest = exportResult.fields.find((f) => f.key === 'guest');
    expect(guest).toMatchObject({ label: 'Guest', type: 'text', value: 'Guest A', display: 'Guest A' });
    const arrival = exportResult.fields.find((f) => f.key === 'arrival');
    expect(arrival.display).toContain('2026');
  });

  it('excludes underscore-prefixed fields', () => {
    const record = { recordId: 'r-1', data: { _internal: 'x', guest: 'g' } };
    const result = buildRecordExport(record, [{ key: '_internal', type: 'text' }, { key: 'guest', type: 'text' }]);
    expect(result.fields.map((f) => f.key)).toEqual(['guest']);
  });
});
