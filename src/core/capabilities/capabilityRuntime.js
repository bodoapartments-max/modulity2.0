/**
 * Modulity 2.0 — Capability Runtime Factory
 *
 * Instantiates trusted engine implementations based on registry descriptors.
 * Runtime objects are not persisted; they are created from declarative
 * CapabilityDefinitions and canonical repositories on demand.
 */

import { createCalendarEngine } from './calendarEngine.js';
import { createBuiltInCapabilityRegistry } from './builtInCapabilityCatalog.js';

export function createCapabilityRuntime(deps) {
  const registry = createBuiltInCapabilityRegistry();

  function createEngine(definition) {
    const descriptor = registry.get(definition.engineId, definition.contractVersion);
    if (!descriptor || descriptor.availability !== 'AVAILABLE') return null;
    if (definition.engineId === 'calendar') return createCalendarEngine(deps);
    return null;
  }

  function isOperational(definition) {
    const descriptor = registry.get(definition.engineId, definition.contractVersion);
    return descriptor?.availability === 'AVAILABLE';
  }

  return { registry, createEngine, isOperational };
}
