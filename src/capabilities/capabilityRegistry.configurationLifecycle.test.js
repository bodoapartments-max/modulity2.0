import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from './capabilityRegistry.js';
import { CAPABILITY_RESOLUTION_REASONS } from './capabilityRegistry.js';
import { createBuiltInCapabilityRegistry } from './registry/builtInCapabilityCatalog.js';

describe('configuration-lifecycle capability registered', () => {
  it('resolves through the canonical Capability Registry with policy-authority dependency', () => {
    const registry = new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();
    const resolved = registry.resolveCapability('configuration-lifecycle');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.OK);
    expect(resolved.exists).toBe(true);
    expect(resolved.available).toBe(true);
    expect(resolved.dependencies).toContain('policy-authority');
    expect(resolved.missingDependencies).toEqual([]);
  });
});
