import { createActorRef } from '../data/actorRef.js';
import { validateAnalyticsDefinition } from './analyticsDefinition.js';

export const REPORT_STATUSES = Object.freeze({ ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' });

export function createReportDefinition({
  reportId, workspaceId, name, description = '', status = REPORT_STATUSES.ACTIVE, version = 1,
  dataSources, filters = [], datePeriod = null, groupBy = [], metrics = [], columns = [], sort = [],
  visualization = { type: 'TABLE' }, createdBy, createdAt = null, updatedAt = null, archivedAt = null,
}) {
  if (!reportId || !workspaceId) throw new Error('Report identity is required');
  if (!name?.trim()) throw new Error('Report name is required');
  if (!Object.values(REPORT_STATUSES).includes(status)) throw new Error('Invalid Report status');
  if (!Number.isInteger(version) || version < 1) throw new Error('Report version must be a positive integer');
  validateAnalyticsDefinition({ dataSources, filters, groupBy, metrics, columns, sort, visualization });
  createActorRef(createdBy);
  return Object.freeze({
    reportId, workspaceId, name: name.trim(), description: description.trim(), status, version,
    dataSources: Object.freeze(dataSources.map((item) => Object.freeze({ ...item }))),
    filters: Object.freeze(filters.map((item) => Object.freeze({ ...item, fieldRef: Object.freeze({ ...item.fieldRef }) }))),
    datePeriod: datePeriod ? Object.freeze({ ...datePeriod }) : null,
    groupBy: Object.freeze(groupBy.map((item) => Object.freeze({ ...item }))),
    metrics: Object.freeze(metrics.map((item) => Object.freeze({ ...item, fieldRef: item.fieldRef ? Object.freeze({ ...item.fieldRef }) : null }))),
    columns: Object.freeze(columns.map((item) => Object.freeze({ ...item }))),
    sort: Object.freeze(sort.map((item) => Object.freeze({ ...item, fieldRef: Object.freeze({ ...item.fieldRef }) }))),
    visualization: Object.freeze({ ...visualization }), createdBy: Object.freeze({ ...createdBy }),
    createdAt, updatedAt, archivedAt,
  });
}
