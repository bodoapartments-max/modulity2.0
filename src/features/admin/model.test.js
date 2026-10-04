import { describe, expect, it } from 'vitest';
import {
  describeAdminAction,
  describeBeforeAfter,
  filterAdminHistory,
} from './model.js';

describe('admin history presentation', () => {
  it('uses human-readable verbs for admin actions', () => {
    expect(describeAdminAction({ action: 'module_category.created' })).toBe('Created Category');
    expect(describeAdminAction({ action: 'entity_type.archived' })).toBe('Archived Entity Type');
    expect(describeAdminAction({ action: 'unknown.x' })).toBe('unknown.x');
  });

  it('renders before/after diffs as readable lines', () => {
    const entry = {
      metadata: {
        change: {
          before: { displayName: 'Vehcile Inspection', status: 'ACTIVE' },
          after: { displayName: 'Vehicle Inspection', status: 'ACTIVE' },
        },
      },
    };
    const lines = describeBeforeAfter(entry);
    expect(lines).toContain('displayName: "Vehcile Inspection" → "Vehicle Inspection"');
    expect(lines.some((l) => l.startsWith('status:'))).toBe(false, 'unchanged fields are dropped');
  });

  it('handles empty or missing changes', () => {
    expect(describeBeforeAfter({})).toEqual([]);
    expect(describeBeforeAfter(null)).toEqual([]);
  });

  it('filters rows by resource and action without touching the server', () => {
    const rows = [
      { resourceType: 'MODULE', action: 'module.updated' },
      { resourceType: 'ENTITY', action: 'entity.archived' },
    ];
    expect(filterAdminHistory(rows, { resourceType: 'MODULE' })).toHaveLength(1);
    expect(filterAdminHistory(rows, { action: 'entity.archived' })).toHaveLength(1);
  });
});
