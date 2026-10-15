import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from './capabilityRegistry.js';
import { CAPABILITY_RESOLUTION_REASONS } from './capabilityRegistry.js';
import { createBuiltInCapabilityRegistry } from './registry/builtInCapabilityCatalog.js';

describe('policy-authority capability registered', () => {
  it('resolves through the canonical Capability Registry with rules dependency', () => {
    const registry = new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();
    const resolved = registry.resolveCapability('policy-authority');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.OK);
    expect(resolved.exists).toBe(true);
    expect(resolved.available).toBe(true);
    expect(resolved.dependencies).toContain('rules');
    expect(resolved.missingDependencies).toEqual([]);
  });
});
