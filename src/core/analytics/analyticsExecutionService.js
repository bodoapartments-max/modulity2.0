import { ANALYTICS_BOUNDS, ANALYTICS_SOURCES, FIELD_SCOPES, validateAnalyticsDefinition } from './analyticsDefinition.js';
import { applyFilters, readFieldValue, resolveDatePeriod } from './filterEngine.js';
import { aggregate, groupAndAggregate } from './aggregationEngine.js';

function limitError(message) {
  const error = new Error(message);
  error.code = 'LIMIT_EXCEEDED';
  return error;
}

function compareValues(left, right) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return typeof left === 'string' ? left.localeCompare(String(right)) : left - right;
}

export function createAnalyticsExecutionService({ recordRepo, moduleRepo, entityRepo, relationshipRepo }) {
  async function validateModuleFields(definition) {
    const modules = await Promise.all(definition.dataSources.filter((source) => source.sourceType === ANALYTICS_SOURCES.RECORDS).map((source) => moduleRepo.getById(definition.workspaceId, source.moduleId)));
    if (modules.some((module) => !module || module.status === 'ARCHIVED')) throw new Error('Report source Module is missing or archived');
    const refs = [...definition.filters.map((item) => item.fieldRef), ...definition.groupBy, ...definition.columns, ...definition.metrics.map((item) => item.fieldRef).filter(Boolean), ...definition.sort.map((item) => item.fieldRef)];
    for (const ref of refs.filter((item) => item.scope === FIELD_SCOPES.DATA)) {
      const candidates = ref.moduleId ? modules.filter((module) => module.moduleId === ref.moduleId) : modules;
      if (!candidates.some((module) => module.formSchema?.fields?.some((field) => field.key === ref.field))) throw new Error(`Referenced field no longer exists: ${ref.field}`);
    }
    return modules;
  }

  async function loadRecords(definition) {
    const moduleIds = definition.dataSources.filter((source) => source.sourceType === ANALYTICS_SOURCES.RECORDS).map((source) => source.moduleId);
    const dateRange = resolveDatePeriod(definition.datePeriod);
    const items = [];
    let cursor = null;
    do {
      const result = await recordRepo.paginatedQuery(definition.workspaceId, {
        bucket: 'ALL', userId: null, moduleId: moduleIds.length === 1 ? moduleIds[0] : null,
        moduleIds: moduleIds.length > 1 ? moduleIds : null,
        status: null, priority: null, recordType: null,
        createdFrom: dateRange?.from || null, createdTo: dateRange?.to || null,
        sortField: 'createdAt', sortDirection: 'desc', startAfter: cursor, limit: 100,
      });
      items.push(...result.items.filter((record) => moduleIds.includes(record.moduleId)));
      if (items.length > ANALYTICS_BOUNDS.MAX_SOURCE_RECORDS) throw limitError(`Report exceeds ${ANALYTICS_BOUNDS.MAX_SOURCE_RECORDS} source Records; narrow the filters`);
      cursor = result.hasMore ? result.nextCursor : null;
    } while (cursor);
    return items;
  }

  async function loadSources(definition) {
    const types = new Set(definition.dataSources.map((source) => source.sourceType));
    if (types.size !== 1) throw new Error('Mixed source types are not supported in one Report');
    const type = definition.dataSources[0].sourceType;
    if (type === ANALYTICS_SOURCES.RECORDS) return loadRecords(definition);
    if (type === ANALYTICS_SOURCES.ENTITIES) {
      const entities = await entityRepo.listByWorkspace(definition.workspaceId);
      const typeIds = definition.dataSources.map((source) => source.entityTypeId).filter(Boolean);
      return typeIds.length ? entities.filter((entity) => typeIds.includes(entity.entityTypeId)) : entities;
    }
    if (type === ANALYTICS_SOURCES.RELATIONSHIPS) return relationshipRepo.listByWorkspace(definition.workspaceId, ANALYTICS_BOUNDS.MAX_ROWS);
    throw new Error('Unsupported analytics source');
  }

  async function resolveEntityLabels(items, definition) {
    const refs = [...definition.columns, ...definition.groupBy].filter((ref) => ref.type === 'entity-reference');
    const ids = new Set();
    for (const item of items) for (const ref of refs) {
      const value = readFieldValue(item, ref);
      const id = typeof value === 'object' ? value?.entityId : value;
      if (id) ids.add(id);
    }
    if (ids.size === 0) return {};
    const entities = entityRepo.getManyByIds
      ? await entityRepo.getManyByIds(definition.workspaceId, [...ids])
      : await Promise.all([...ids].slice(0, 100).map((id) => entityRepo.getById(definition.workspaceId, id)));
    return Object.fromEntries(entities.filter(Boolean).map((entity) => [entity.entityId, entity.displayName]));
  }

  async function execute(definition) {
    validateAnalyticsDefinition(definition);
    if (definition.dataSources.some((source) => source.sourceType === ANALYTICS_SOURCES.RECORDS)) await validateModuleFields(definition);
    let items = applyFilters(await loadSources(definition), definition.filters);
    for (const sort of [...definition.sort].reverse()) {
      items = [...items].sort((a, b) => compareValues(readFieldValue(a, sort.fieldRef), readFieldValue(b, sort.fieldRef)) * (sort.direction === 'desc' ? -1 : 1));
    }
    const entityLabels = await resolveEntityLabels(items, definition);
    const totalMatched = items.length;
    const rows = items.slice(0, ANALYTICS_BOUNDS.MAX_ROWS).map((item) => ({
      recordId: item.recordId || null, moduleId: item.moduleId || null, moduleVersion: item.moduleVersion || null,
      values: Object.fromEntries(definition.columns.map((fieldRef) => {
        const value = readFieldValue(item, fieldRef);
        const entityId = fieldRef.type === 'entity-reference' ? (typeof value === 'object' ? value?.entityId : value) : null;
        return [fieldRef.field, entityId ? { entityId, displayName: entityLabels[entityId] || entityId } : value ?? null];
      })),
    }));
    return Object.freeze({
      definition, executedAt: new Date().toISOString(), filters: definition.filters,
      summary: aggregate(items, definition.metrics), groups: groupAndAggregate(items, definition.groupBy, definition.metrics),
      rows, totalMatched, truncated: totalMatched > ANALYTICS_BOUNDS.MAX_ROWS,
      bounds: ANALYTICS_BOUNDS,
    });
  }

  return { execute };
}
