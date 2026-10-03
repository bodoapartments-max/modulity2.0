/**
 * Modulity 2.0 — Calendar Capability Engine public API
 */

export { createCalendarEngine } from './runtime/calendarEngine.js';
export { createCalendarDefinitionV1, validateCalendarDefinitionV1, CALENDAR_DEFINITION_TYPE, CALENDAR_ENGINE_ID } from './validation/calendarDefinitionV1.js';
export { createCalendarEventProjection } from './domain/calendarProjection.js';
