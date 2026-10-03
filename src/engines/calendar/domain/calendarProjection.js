/**
 * Modulity 2.0 — Calendar Projection model
 *
 * A derived, rebuildable read-model projection of a canonical Record
 * interpreted through a CalendarDefinition. This is NOT a canonical Entity
 * or Record; it can always be rebuilt from Record + Definition.
 */

/**
 * @typedef {Object} CalendarEventProjection
 * @property {string} recordId
 * @property {string} definitionId
 * @property {string} definitionName
 * @property {string} moduleId
 * @property {string} moduleName
 * @property {number|null} moduleVersion
 * @property {string} title
 * @property {string} start — ISO 8601 string
 * @property {string|null} end — ISO 8601 string or null
 * @property {boolean} allDay
 * @property {Object|null} resourceRef — canonical EntityReference
 * @property {string|null} resourceLabel
 * @property {string} recordStatus
 */

export function createCalendarEventProjection({
  recordId,
  definitionId,
  definitionName = '',
  moduleId,
  moduleName = '',
  moduleVersion = null,
  title,
  start,
  end = null,
  allDay = false,
  resourceRef = null,
  resourceLabel = null,
  recordStatus = '',
}) {
  if (!recordId) throw new Error('recordId is required');
  if (!definitionId) throw new Error('definitionId is required');
  if (!moduleId) throw new Error('moduleId is required');
  if (!title && title !== '') throw new Error('title is required');
  if (!start) throw new Error('start is required');

  return Object.freeze({
    recordId,
    definitionId,
    definitionName: String(definitionName),
    moduleId,
    moduleName: String(moduleName),
    moduleVersion,
    title: String(title),
    start: String(start),
    end: end ? String(end) : null,
    allDay: Boolean(allDay),
    resourceRef,
    resourceLabel: resourceLabel ? String(resourceLabel) : null,
    recordStatus: String(recordStatus),
  });
}
