import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from './capabilityRegistry.js';
import { CAPABILITY_RESOLUTION_REASONS } from './capabilityRegistry.js';
import { createBuiltInCapabilityRegistry } from './registry/builtInCapabilityCatalog.js';

describe('agent-runtime capability registered', () => {
  it('resolves through the canonical Capability Registry with simulation + policy dependencies', () => {
    const registry = new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();
    const resolved = registry.resolveCapability('agent-runtime');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.OK);
    expect(resolved.exists).toBe(true);
    expect(resolved.available).toBe(true);
    expect(resolved.dependencies).toContain('simulation');
    expect(resolved.dependencies).toContain('policy-authority');
    expect(resolved.missingDependencies).toEqual([]);
  });
});
