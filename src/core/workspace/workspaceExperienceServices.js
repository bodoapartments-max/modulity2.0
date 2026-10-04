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

export const MODULE_PREFERENCE_VIEW_MODES = Object.freeze({
  FLAT: 'FLAT',
  GROUPED: 'GROUPED',
});

/**
 * Personal Module presentation preferences — presentation only (ADR-0012).
 *
 * Canonical shape (moduleSelection object on userWorkspacePreferences):
 * {
 *   selectedModuleIds: string[],   // canonical moduleIds the user wants prominent
 *   moduleOrder: string[],         // personal ordering over ALL preferred modules
 *   viewMode: 'FLAT'|'GROUPED'     // grouped by canonical category, or flat
 *   collapsedCategoryIds: string[] // UI collapse state
 * }
 *
 * INVARIANTS:
 * - selectedModuleIds ⊆ modules the user could otherwise access (service
 *   validates against the workspace's Module list; authorization itself is
 *   NOT decided by this document)
 * - writing a preference never grants access; hiding never revokes it
 * - keys are references (moduleIds), NEVER copied Module data
 */
export function createWorkspacePreferenceService({ preferenceRepo, worksetRepo, moduleRepo = null }) {
  async function readSelection(workspaceId, userId) {
    const pref = await preferenceRepo.get(workspaceId, userId);
    return pref?.moduleSelection || null;
  }

  async function writeSelection(workspaceId, userId, partial) {
    const existing = (await preferenceRepo.get(workspaceId, userId))?.moduleSelection || {};
    const next = {
      selectedModuleIds: Array.isArray(partial.selectedModuleIds) ? partial.selectedModuleIds : (existing.selectedModuleIds || []),
      moduleOrder: Array.isArray(partial.moduleOrder) ? partial.moduleOrder : (existing.moduleOrder || []),
      viewMode: MODULE_PREFERENCE_VIEW_MODES[partial.viewMode] ? partial.viewMode : (existing.viewMode || MODULE_PREFERENCE_VIEW_MODES.GROUPED),
      collapsedCategoryIds: Array.isArray(partial.collapsedCategoryIds) ? partial.collapsedCategoryIds : (existing.collapsedCategoryIds || []),
    };

    // Authorization boundary enforcement — the server/service side proof that
    // personal preferences can only reference Modules that EXIST in this
    // workspace. This never grants access; it only keeps the preference clean.
    if (moduleRepo?.listByWorkspace) {
      const modules = await moduleRepo.listByWorkspace(workspaceId, 500);
      const allowed = new Set(modules.map((m) => m.moduleId));
      next.selectedModuleIds = [...new Set(next.selectedModuleIds)].filter((id) => allowed.has(id));
      next.moduleOrder = [...new Set(next.moduleOrder)].filter((id) => allowed.has(id));
    }

    return preferenceRepo.upsert(workspaceId, userId, { moduleSelection: next });
  }

  return {
    get: preferenceRepo.get,
    getModuleSelection: readSelection,
    setModuleSelection: writeSelection,
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
