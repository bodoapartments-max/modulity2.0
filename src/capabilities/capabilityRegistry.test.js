import { describe, expect, it } from 'vitest';
import { CapabilityRegistry, CAPABILITY_RESOLUTION_REASONS, createCapabilityRegistry } from './capabilityRegistry.js';
import { CapabilityEngineRegistry } from './registry/capabilityEngineRegistry.js';
import { CAPABILITY_AVAILABILITY, CAPABILITY_MODES, CAPABILITY_SOURCE_KINDS } from './contracts/capabilityContracts.js';

function makeDescriptor(engineId, { requires = [], availability = CAPABILITY_AVAILABILITY.AVAILABLE } = {}) {
  return {
    engineId,
    contractVersion: '1.0.0',
    name: engineId,
    description: engineId,
    availability,
    mode: CAPABILITY_MODES.READ,
    definitionTypes: [],
    supportedSourceKinds: [CAPABILITY_SOURCE_KINDS.MODULE],
    capabilities: ['op-a', 'op-b'],
    requires,
    optionalDependencies: [],
  };
}

describe('canonical Capability Registry (Step 21)', () => {
  it('registers and retrieves deterministically', () => {
    const registry = new CapabilityRegistry().registerCatalog();
    const list = registry.listCapabilities();
    expect(list.length).toBeGreaterThan(0);
    const calendar = registry.getCapability('calendar');
    expect(calendar).toBeTruthy();
    expect(calendar.availability).toBe(CAPABILITY_AVAILABILITY.AVAILABLE);
    expect(calendar.operations || calendar.capabilities).toBeDefined();
  });

  it('answers presence checks without side effects', () => {
    const registry = new CapabilityRegistry().registerCatalog();
    expect(registry.hasCapability('calendar')).toBe(true);
    expect(registry.hasCapability('does-not-exist')).toBe(false);
  });

  it('reports direct dependencies and reverse dependents', () => {
    const registry = new CapabilityRegistry().registerCatalog();
    const scheduling = registry.getCapability('scheduling');
    expect(scheduling.requires).toContain('calendar');
    expect(registry.getDependencies('scheduling')).toEqual(['calendar']);
    const dependents = registry.getDependents('calendar');
    expect(dependents).toContain('scheduling');
  });

  it('supports deep resolution without burning cycles', () => {
    const registry = new CapabilityRegistry().registerCatalog();
    const resolved = registry.resolveCapability('calendar');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.OK);
    expect(resolved.exists).toBe(true);
    expect(resolved.available).toBe(true);
    expect(resolved.missingDependencies).toHaveLength(0);
  });

  it('announces UNKNOWN_CAPABILITY for unregistered ids', () => {
    const registry = new CapabilityRegistry().registerCatalog();
    const resolved = registry.resolveCapability('hacking-you-dont-exist');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.UNKNOWN_CAPABILITY);
    expect(resolved.exists).toBe(false);
    expect(resolved.diagnostics.length).toBeGreaterThan(0);
  });

  it('flags MISSING_DEPENDENCY for requires pointing outside the registry', () => {
    const inner = new CapabilityEngineRegistry();
    inner.register(makeDescriptor('own'), {});
    inner.register(makeDescriptor('child', { requires: ['not-registered-yet'] }), {});
    const registry = new CapabilityRegistry(inner);
    const resolved = registry.resolveCapability('child');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.MISSING_DEPENDENCY);
    expect(resolved.missingDependencies).toEqual(['not-registered-yet']);
    expect(resolved.diagnostics.join(' ')).toContain('not-registered-yet');
  });

  it('reports a cycle by preserving call edges deterministically', () => {
    const inner = new CapabilityEngineRegistry();
    inner.register(makeDescriptor('a-engine', { requires: ['b-engine'] }), {});
    expect(() => inner.register(makeDescriptor('b-engine', { requires: ['a-engine'] }), {})).toThrow(/cycle/);
  });

  it('enforces duplicate registration as registry-level conflict', () => {
    const inner = new CapabilityEngineRegistry();
    inner.register(makeDescriptor('own'), {});
    expect(() => inner.register(makeDescriptor('own'), {})).toThrow(/already registered/);
  });

  it('is deterministic across independent runs', () => {
    const a = new CapabilityRegistry().registerCatalog().listCapabilities();
    const b = new CapabilityRegistry().registerCatalog().listCapabilities();
    expect(a.map((c) => c.engineId)).toEqual(b.map((c) => c.engineId));
  });

  it('never claims an availability that a registry does not own', () => {
    const registry = new CapabilityRegistry().registerCatalog();
    expect(registry.resolveCapability('does-not-exist').available).toBe(false);
  });
});
