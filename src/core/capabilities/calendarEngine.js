/**
 * Modulity 2.0 — Calendar Engine
 *
 * Deterministic read-only projection engine that turns canonical Records into
 * derived CalendarEventProjection objects via a CalendarDefinition.
 *
 * Invariants:
 * - Never mutates canonical Records.
 * - Never creates calendar-owned business records.
 * - Queries are bounded by module + optional date window.
 * - Projections are rebuildable from canonical data.
 */

import { CAPABILITY_DEFINITION_STATUSES } from './capabilityContracts.js';
import { validateCalendarDefinitionV1, CALENDAR_DEFINITION_TYPE } from './calendarDefinitionV1.js';
import { createCalendarEventProjection } from './calendarProjection.js';

function isValidDateString(value) {
  if (typeof value !== 'string' || !value) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

function toDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // date-only: interpret as local midnight to preserve displayed date
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
}

function normalizeEnd(value, allDay) {
  if (!value) return null;
  if (allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // For all-day ranges, end date is inclusive (e.g. departure 2026-10-14).
    // Return the inclusive date string; consumers can render as end-of-day.
    return value;
  }
  return value;
}

function overlapsWindow(start, end, windowStart, windowEnd) {
  const eventStart = toDate(start).getTime();
  const eventEnd = end ? toDate(end).getTime() : eventStart;
  const winStart = toDate(windowStart).getTime();
  const winEnd = toDate(windowEnd).getTime();
  return eventStart <= winEnd && eventEnd >= winStart;
}

function resolveFieldValue(record, mapping, fieldKey) {
  return record.data?.[mapping[fieldKey]];
}

export function createCalendarEngine({ recordRepo, moduleRepo, entityRepo }) {
  async function validateDefinition(definition, source) {
    if (definition.status !== CAPABILITY_DEFINITION_STATUSES.ACTIVE) {
      return { valid: false, issues: [{ code: 'DEFINITION_INACTIVE', message: 'Calendar definition is not active' }] };
    }
    if (definition.configuration?.definitionType !== CALENDAR_DEFINITION_TYPE) {
      return { valid: false, issues: [{ code: 'DEFINITION_TYPE_MISMATCH', message: `Expected ${CALENDAR_DEFINITION_TYPE}` }] };
    }
    return validateCalendarDefinitionV1(definition, { source });
  }

  async function resolveSourceForDefinition(definition) {
    const ref = definition.source.ref;
    if (definition.source.kind !== 'MODULE' || !ref.startsWith('module:')) return null;
    const moduleCode = ref.replace('module:', '');
    const mod = await moduleRepo.getByCode(definition.workspaceId, moduleCode);
    if (!mod || mod.workspaceId !== definition.workspaceId) return null;
    return {
      kind: 'MODULE',
      workspaceId: mod.workspaceId,
      moduleCode,
      moduleId: mod.moduleId,
      formSchema: mod.formSchema,
      status: mod.status,
    };
  }

  async function buildFieldMap(definition, source) {
    const fields = source?.formSchema?.fields || [];
    const mapping = definition.configuration.mapping;
    const fieldByKey = (key) => fields.find((f) => f.key === key);
    return {
      title: fieldByKey(mapping.titleField),
      start: fieldByKey(mapping.startField),
      end: mapping.endField ? fieldByKey(mapping.endField) : null,
      resource: mapping.resourceField ? fieldByKey(mapping.resourceField) : null,
    };
  }

  async function resolveResourceLabels(resourceRefs, workspaceId) {
    if (!resourceRefs.length || !entityRepo) return {};
    const unique = [...new Map(resourceRefs.map((r) => [r.entityId, r])).values()];
    const entities = await entityRepo.getManyByIds(workspaceId, unique.map((r) => r.entityId));
    const labels = {};
    for (const entity of entities) {
      if (entity) labels[entity.entityId] = entity.displayName;
    }
    return labels;
  }

  function extractEntityRef(value) {
    if (value && typeof value === 'object' && value.entityId) {
      return { entityId: value.entityId, entityTypeId: value.entityTypeId, workspaceId: value.workspaceId };
    }
    return null;
  }

  async function projectSingleRecord(record, definition, fieldMap, resourceLabels) {
    const mapping = definition.configuration.mapping;
    const titleValue = resolveFieldValue(record, mapping, 'titleField');
    const startValue = resolveFieldValue(record, mapping, 'startField');
    const endValue = mapping.endField ? resolveFieldValue(record, mapping, 'endField') : null;

    const startType = fieldMap.start?.type;
    const endType = fieldMap.end?.type;
    const allDay = startType === 'date' || (endType === 'date' && endValue);

    let title;
    if (titleValue === undefined || titleValue === null) {
      title = '(no title)';
    } else if (fieldMap.title?.type === 'entity-reference') {
      const ref = extractEntityRef(titleValue);
      title = ref ? resourceLabels[ref.entityId] || '(unknown)' : '(invalid reference)';
    } else {
      title = String(titleValue);
    }
    const start = startValue;
    const end = normalizeEnd(endValue, allDay);

    let resourceRef = null;
    if (mapping.resourceField && fieldMap.resource?.type === 'entity-reference') {
      const raw = record.data?.[mapping.resourceField];
      if (raw && typeof raw === 'object' && raw.entityId) {
        resourceRef = { entityId: raw.entityId, entityTypeId: raw.entityTypeId, workspaceId: raw.workspaceId };
      }
    }

    return createCalendarEventProjection({
      recordId: record.recordId,
      definitionId: definition.definitionId,
      moduleId: record.moduleId,
      moduleVersion: record.moduleVersion,
      title,
      start,
      end,
      allDay,
      resourceRef,
      resourceLabel: resourceRef ? resourceLabels[resourceRef.entityId] || null : null,
      recordStatus: record.status,
    });
  }

  async function queryRecordsForDefinition(definition, source, options = {}) {
    const { windowStart, windowEnd, recordStatus, limit = 500 } = options;

    // Bounded query by moduleId (indexed). We do not load all workspace records.
    const records = await recordRepo.query(definition.workspaceId, { moduleId: source.moduleId, status: recordStatus });
    const bounded = records.slice(0, limit);

    if (windowStart && windowEnd) {
      return bounded.filter((record) => {
        const start = resolveFieldValue(record, definition.configuration.mapping, 'startField');
        if (!isValidDateString(start)) return false;
        const end = definition.configuration.mapping.endField
          ? resolveFieldValue(record, definition.configuration.mapping, 'endField')
          : null;
        return overlapsWindow(start, end, windowStart, windowEnd);
      });
    }
    return bounded;
  }

  async function project(definition, options = {}) {
    const source = await resolveSourceForDefinition(definition);
    const validation = await validateDefinition(definition, source);
    if (!validation.valid) {
      return { ok: false, error: { code: 'INVALID_DEFINITION', issues: validation.issues }, events: [] };
    }

    try {
      const fieldMap = await buildFieldMap(definition, source);
      const records = await queryRecordsForDefinition(definition, source, options);
      const resourceRefs = [];
      const projections = [];

      for (const record of records) {
        const start = resolveFieldValue(record, definition.configuration.mapping, 'startField');
        if (!isValidDateString(start)) continue;
        const mapping = definition.configuration.mapping;
        if (mapping.titleField) {
          const titleRaw = record.data?.[mapping.titleField];
          const titleRef = extractEntityRef(titleRaw);
          if (titleRef) resourceRefs.push(titleRef);
        }
        if (mapping.resourceField) {
          const resourceRaw = record.data?.[mapping.resourceField];
          const resourceRef = extractEntityRef(resourceRaw);
          if (resourceRef) resourceRefs.push(resourceRef);
        }
      }

      const resourceLabels = await resolveResourceLabels(resourceRefs, definition.workspaceId);

      for (const record of records) {
        const projection = await projectSingleRecord(record, definition, fieldMap, resourceLabels);
        projections.push(projection);
      }

      // Deterministic ordering by start, then recordId
      projections.sort((a, b) => {
        const cmp = toDate(a.start).getTime() - toDate(b.start).getTime();
        return cmp === 0 ? a.recordId.localeCompare(b.recordId) : cmp;
      });

      return { ok: true, events: projections };
    } catch (error) {
      return { ok: false, error: { code: 'PROJECTION_FAILED', message: error.message }, events: [] };
    }
  }

  async function projectMultiple(definitions, options = {}) {
    const results = await Promise.all(definitions.map((definition) => project(definition, options)));
    const allEvents = [];
    const errors = [];
    for (const result of results) {
      if (result.ok) allEvents.push(...result.events);
      else errors.push(result.error);
    }
    allEvents.sort((a, b) => {
      const cmp = toDate(a.start).getTime() - toDate(b.start).getTime();
      return cmp === 0 ? a.recordId.localeCompare(b.recordId) : cmp;
    });
    return { ok: errors.length === 0, events: allEvents, errors };
  }

  return { project, projectMultiple, validateDefinition };
}
