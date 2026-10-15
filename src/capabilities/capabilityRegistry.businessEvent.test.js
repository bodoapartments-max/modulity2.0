import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from './capabilityRegistry.js';
import { CAPABILITY_RESOLUTION_REASONS } from './capabilityRegistry.js';
import { createBuiltInCapabilityRegistry } from './registry/builtInCapabilityCatalog.js';

describe('Business Event Backbone capability (Step 22)', () => {
  it('registers and resolves through the canonical Capability Registry', () => {
    const registry = new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();
    const resolved = registry.resolveCapability('business-event');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.OK);
    expect(resolved.exists).toBe(true);
    expect(resolved.available).toBe(true);
    expect(resolved.operations).toContain('emit');
    expect(resolved.modules).not.toBeDefined?.() ?? true;
  });

  it('does NOT invent future capabilities — only emit/retrieve is in scope', () => {
    const registry = new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();
    const resolved = registry.resolveCapability('rules-engine-not-built-yet');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.UNKNOWN_CAPABILITY);
  });
});
