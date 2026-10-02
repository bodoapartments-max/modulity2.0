import { describe, expect, it, vi } from 'vitest';
import { createWorkset } from './workset.js';
import { createWidgetDefinition, validateWidgetQuery } from './widgetDefinition.js';
import { createNotification } from './notification.js';
import { createWorkspacePreferenceService } from './workspaceExperienceServices.js';

const actor = { actorType: 'USER', actorId: 'user-1' };

describe('Workspace Experience models', () => {
  it('creates a Workset from canonical Module IDs without duplicates', () => {
    const workset = createWorkset({ worksetId: 'w1', workspaceId: 'ws1', name: 'Field', moduleIds: ['m1', 'm1'], createdBy: actor });
    expect(workset.moduleIds).toEqual(['m1']);
    expect(Object.isFrozen(workset)).toBe(true);
  });

  it('rejects invalid Workset status', () => {
    expect(() => createWorkset({ worksetId: 'w1', workspaceId: 'ws1', name: 'Field', status: 'DELETED', createdBy: actor })).toThrow('Invalid');
  });

  it('creates configuration-only WidgetDefinition', () => {
    const widget = createWidgetDefinition({ widgetId: 'wi1', workspaceId: 'ws1', ownerUserId: 'user-1', name: 'Pending', type: 'KPI', source: 'RECORDS', filters: [{ field: 'status', operator: '==', value: 'SUBMITTED' }], createdBy: actor });
    expect(widget.source).toBe('RECORDS');
    expect(widget).not.toHaveProperty('records');
  });

  it('rejects unsafe Widget fields and unbounded limits', () => {
    expect(() => validateWidgetQuery({ source: 'RECORDS', filters: [{ field: 'data.secret', operator: '==', value: true }] })).toThrow('Unsupported Record');
    expect(() => validateWidgetQuery({ source: 'RECORDS', limit: 500 })).toThrow('between 1 and 50');
  });

  it('creates a canonical-resource Notification reference', () => {
    const notification = createNotification({ notificationId: 'n1', workspaceId: 'ws1', recipientUserId: 'user-1', type: 'RECORD_SENT', title: 'Record received', resourceType: 'RECORD', resourceId: 'r1', createdBy: actor });
    expect(notification.resourceId).toBe('r1');
    expect(notification.status).toBe('UNREAD');
  });
});

describe('active Workset preference', () => {
  it('validates Workset workspace availability before saving', async () => {
    const preferenceRepo = { upsert: vi.fn(), get: vi.fn() };
    const worksetRepo = { getById: vi.fn().mockResolvedValue({ worksetId: 'w1', status: 'ACTIVE' }) };
    const service = createWorkspacePreferenceService({ preferenceRepo, worksetRepo });
    await service.setActiveWorkset('ws1', 'user-1', 'w1');
    expect(preferenceRepo.upsert).toHaveBeenCalledWith('ws1', 'user-1', { activeWorksetId: 'w1' });
  });

  it('rejects unavailable Workset preferences', async () => {
    const service = createWorkspacePreferenceService({ preferenceRepo: { upsert: vi.fn() }, worksetRepo: { getById: vi.fn().mockResolvedValue(null) } });
    await expect(service.setActiveWorkset('ws1', 'user-1', 'missing')).rejects.toThrow('not available');
  });
});
