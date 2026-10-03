/**
 * Modulity 2.0 — Capability Runtime Factory
 *
 * Instantiates trusted engine implementations based on registry descriptors.
 * Runtime objects are not persisted; they are created from declarative
 * CapabilityDefinitions and canonical repositories on demand.
 */

import { createBuiltInCapabilityRegistry } from '../registry/builtInCapabilityCatalog.js';

export function createCapabilityRuntime(deps) {
  const registry = deps.registry || createBuiltInCapabilityRegistry();
  const engineFactories = new Map();

  function registerEngineFactory(engineId, contractVersion, factory) {
    if (typeof factory !== 'function') throw new Error('Engine factory must be a function');
    engineFactories.set(`${engineId}@${contractVersion}`, factory);
  }

  function createEngine(definition) {
    const descriptor = registry.get(definition.engineId, definition.contractVersion);
    if (!descriptor || descriptor.availability !== 'AVAILABLE') return null;
    const factory = engineFactories.get(`${definition.engineId}@${definition.contractVersion}`);
    return factory ? factory(deps) : null;
  }

  function isOperational(definition) {
    const descriptor = registry.get(definition.engineId, definition.contractVersion);
    return descriptor?.availability === 'AVAILABLE';
  }

  return { registry, engineFactories, createEngine, isOperational, registerEngineFactory };
}
