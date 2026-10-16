/**
 * Modulity 2.0 — Canonical Capability Registry (Step 21)
 *
 * Deterministic machine-readable answers to:
 *   - What capabilities exist?
 *   - Which contract version?
 *   - Which operations does each capability expose?
 *   - What dependencies does it have?
 *   - Are those registered, and if missing — which?
 *   - Which downstream capabilities depend on it?
 *
 * PRINCIPLES
 * - REUSES CapabilityEngineRegistry as the canonical write side — this is the
 *   READ-side facade; both reference the same registry instance by design.
 * - Deterministic: NO AI input, NO Firestore call for the built-in catalog,
 *   NO component-driven permissions — REGISTERED is plainly different from
 *   AVAILABLE.
 * - Never invent: roadmap items are never auto-listed on this registry unless
 *   they exist; AND automations must not self-float to the topic model.
 *
 * MODULITY CORE: MODULE != FORM != RECORD != ENTITY.
 */
import { CapabilityEngineRegistry } from './registry/capabilityEngineRegistry.js';
import { BUILT_IN_CAPABILITY_DESCRIPTORS } from './registry/builtInCapabilityCatalog.js';

export const CAPABILITY_RESOLUTION_REASONS = Object.freeze({
  OK: 'OK',
  UNKNOWN_CAPABILITY: 'UNKNOWN_CAPABILITY',
  MISSING_DEPENDENCY: 'MISSING_DEPENDENCY',
  DEPENDENCY_CYCLE: 'DEPENDENCY_CYCLE',
});

/**
 * Deterministic capability-registry front-end.
 *
 * Same canonical deep model: for each registered capability it can answer
 * operations, dependencies, reverse-dependents, presence, availability in
 * descriptor terms — yet the parameter contracts stay strict through the
 * existing validateDefinition engine.
 */
export class CapabilityRegistry {
  constructor(registry = null) {
    this._engineRegistry = registry || new CapabilityEngineRegistry();
  }

  /**
   * Registers the built-in capability catalog (one canonical source).
   * Idempotent — calling twice in app code produces the same registry.
   */
  registerCatalog() {
    for (const descriptor of BUILT_IN_CAPABILITY_DESCRIPTORS) {
      if (!this._engineRegistry.has(descriptor.engineId, descriptor.contractVersion)) {
        this._engineRegistry.register(descriptor, {});
      }
    }
    return this;
  }

  /** Returns the full catalog of registered capabilities (sorted, stable). */
  listCapabilities() {
    return this._engineRegistry.list();
  }

  /** True if (engineId, version) exists — says nothing about availability. */
  hasCapability(engineId, contractVersion = '1.0.0') {
    return this._engineRegistry.has(engineId, contractVersion);
  }

  /** Returns the registered descriptor or null. */
  getCapability(engineId, contractVersion = '1.0.0') {
    return this._engineRegistry.get(engineId, contractVersion);
  }

  /** Direct explicit dependencies of a capability (DEFINED edges). */
  getDependencies(engineId) {
    const cap = this.getCapability(engineId);
    return cap ? [...cap.requires] : [];
  }

  /** Reverse dependents — capabilities that directly depend on this one. */
  getDependents(engineId) {
    return this.listCapabilities().filter((cap) => cap.requires.includes(engineId)).map((cap) => cap.engineId);
  }

  /**
   * Structured resolution result for the requested capability.
   * Never throws — the returned shape is the stable contract.
   */
  resolveCapability(engineId, contractVersion = '1.0.0') {
    const result = {
      capabilityId: engineId,
      status: CAPABILITY_RESOLUTION_REASONS.OK,
      exists: false,
      available: false,
      operations: [],
      dependencies: [],
      missingDependencies: [],
      dependents: [],
      diagnostics: [],
    };
    const exists = this._engineRegistry.capabilities?.has
      ? this._engineRegistry.has(engineId, contractVersion) // registry surface
      : false;
    void exists;
    const descriptor = this.getCapability(engineId, contractVersion);
    if (descriptor) {
      result.exists = true;
      result.available = descriptor.availability === 'AVAILABLE';
      result.operations = [...(descriptor.capabilities || [])];
      result.dependencies = [...(descriptor.requires || [])];
      result.dependents = this.getDependents(engineId);
    } else {
      result.status = CAPABILITY_RESOLUTION_REASONS.UNKNOWN_CAPABILITY;
      result.diagnostics.push(`No registered capability id '${engineId}'@'${contractVersion}'`);
      // continue into full resolution — the caller can still learn about missing天王 surface.
    }

    this._annotateMissingDependencies({ engineId, result });
    return Object.freeze(result);
  }

  /** Final pass: low-level missing-dependency flags derived from the graph. */
  _annotateMissingDependencies({ engineId, result }) {
    const cap = this.getCapability(engineId);
    if (!cap) {
      if (result.status === CAPABILITY_RESOLUTION_REASONS.UNKNOWN_CAPABILITY) return;
      result.status = CAPABILITY_RESOLUTION_REASONS.UNKNOWN_CAPABILITY;
      return;
    }
    const missing = cap.requires.filter((dep) => !this.hasCapability(dep));
    result.missingDependencies = missing;
    if (missing.length) {
      result.status = CAPABILITY_RESOLUTION_REASONS.MISSING_DEPENDENCY;
      result.diagnostics.push(`Dependency missing for '${engineId}': ${missing.join(', ')}`);
    }
  }
}

/** Canonical Capability Registry facade (services-scale consumers only). */
export function createCapabilityRegistry(registry = null) {
  return new CapabilityRegistry(registry);
}
