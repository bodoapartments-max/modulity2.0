import { generateId } from '../utils/generateId.js';
import { createWidgetDefinition, WIDGET_STATUSES, validateWidgetQuery } from './widgetDefinition.js';
import { createNotification, NOTIFICATION_STATUSES } from './notification.js';

export function createWidgetService({ widgetRepo }) {
  return {
    async create(params) {
      return widgetRepo.create(createWidgetDefinition({ ...params, widgetId: generateId() }));
    },
    async update(workspaceId, widgetId, changes, userId) {
      const existing = await widgetRepo.getById(workspaceId, widgetId);
      if (!existing || existing.ownerUserId !== userId) throw new Error('Widget not found');
      const candidate = createWidgetDefinition({ ...existing, ...changes, widgetId, workspaceId, ownerUserId: existing.ownerUserId, createdBy: existing.createdBy });
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...safeChanges } = candidate;
      return widgetRepo.update(workspaceId, widgetId, safeChanges);
    },
    archive(workspaceId, widgetId, userId) { return this.update(workspaceId, widgetId, { status: WIDGET_STATUSES.ARCHIVED }, userId); },
    listForUser: widgetRepo.listForUser,
  };
}

export function createWidgetQueryService({ recordQueryService, relationshipRepo }) {
  return {
    async execute(definition, userId) {
      validateWidgetQuery({ source: definition.source, filters: definition.filters, limit: definition.display?.limit || 10 });
      if (definition.source === 'RELATIONSHIPS') {
        return relationshipRepo.listByWorkspace(definition.workspaceId, { limit: Math.min(definition.display?.limit || 10, 50) });
      }
      const filters = Object.fromEntries(definition.filters.map((filter) => [filter.field, filter.value]));
      return recordQueryService.queryRecords({
        workspaceId: definition.workspaceId, userId, bucket: 'ALL', moduleId: definition.moduleId || filters.moduleId || null,
        status: filters.status || null, priority: filters.priority || null, limit: Math.min(definition.display?.limit || 10, 50),
      });
    },
  };
}

export function createNotificationService({ notificationRepo }) {
  return {
    async create(params) { return notificationRepo.create(createNotification({ ...params, notificationId: generateId() })); },
    listForUser: notificationRepo.listForUser,
    listForUserPage: notificationRepo.listForUserPage,
    countUnread: notificationRepo.countUnread,
    markRead(workspaceId, notificationId) { return notificationRepo.updateStatus(workspaceId, notificationId, NOTIFICATION_STATUSES.READ); },
    markUnread(workspaceId, notificationId) { return notificationRepo.updateStatus(workspaceId, notificationId, NOTIFICATION_STATUSES.UNREAD); },
    archive(workspaceId, notificationId) { return notificationRepo.updateStatus(workspaceId, notificationId, NOTIFICATION_STATUSES.ARCHIVED); },
  };
}

export function createWorkspacePreferenceService({ preferenceRepo, worksetRepo }) {
  return {
    get: preferenceRepo.get,
    async setActiveWorkset(workspaceId, userId, worksetId) {
      if (worksetId) {
        const workset = await worksetRepo.getById(workspaceId, worksetId);
        if (!workset || workset.status !== 'ACTIVE') throw new Error('Workset is not available');
      }
      return preferenceRepo.upsert(workspaceId, userId, { activeWorksetId: worksetId || null });
    },
    updateLayout(workspaceId, userId, dashboardWidgetIds) {
      return preferenceRepo.upsert(workspaceId, userId, { dashboardWidgetIds: [...new Set(dashboardWidgetIds)].slice(0, 20) });
    },
  };
}
