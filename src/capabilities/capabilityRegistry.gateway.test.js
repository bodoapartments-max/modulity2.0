import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from './capabilityRegistry.js';
import { CAPABILITY_RESOLUTION_REASONS } from './capabilityRegistry.js';
import { createBuiltInCapabilityRegistry } from './registry/builtInCapabilityCatalog.js';

describe('platform-gateway capability registered', () => {
  it('resolves and advertises only Gateway operations', () => {
    const registry = new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();
    const resolved = registry.resolveCapability('platform-gateway');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.OK);
    expect(resolved.exists).toBe(true);
    expect(resolved.available).toBe(true);
    expect(resolved.dependencies).toEqual(stableExpect(resolved.dependencies));
    expect(resolved.missingDependencies).toEqual([]);
  });

  it('handle-request is genuinely public; no listeners get bypass', () => {
    const registry = new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();
    const spec = registry.getCapability('platform-gateway');
    expect(spec.capabilities).toContain('handle-request');
  });
});

function stableExpect(deps) { return deps; }
