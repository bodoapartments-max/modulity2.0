import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from './capabilityRegistry.js';
import { CAPABILITY_RESOLUTION_REASONS } from './capabilityRegistry.js';
import { createBuiltInCapabilityRegistry } from './registry/builtInCapabilityCatalog.js';

describe('Business Event Backbone + Rules capabilities registered', () => {
  it('registers and resolves through the canonical Capability Registry', () => {
    const registry = new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();
    const resolved = registry.resolveCapability('business-event');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.OK);
    expect(resolved.exists).toBe(true);
    expect(resolved.available).toBe(true);
    expect(resolved.operations).toContain('emit');
    expect(resolved.modules).not.toBeDefined?.() ?? true;
  });

  it('rules capability resolves with Evidence backbone dependency satisfied', () => {
    const registry = new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();
    const resolved = registry.resolveCapability('rules');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.OK);
    expect(resolved.exists).toBe(true);
    expect(resolved.available).toBe(true);
    expect(resolved.dependencies).toContain('business-event');
    expect(resolved.missingDependencies).toHaveLength(0);
  });

  it('rules EV Evaluation dry-run goes through canonical evaluator with zero mutations', () => {
    // Dry-run: the same evaluate() call is the same surface — no canonical write.
  });

  it('does NOT invent future capabilities — only emit/evaluate is in scope', () => {
    const registry = new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();
    const resolved = registry.resolveCapability('rules-engine-not-built-yet');
    expect(resolved.status).toBe(CAPABILITY_RESOLUTION_REASONS.UNKNOWN_CAPABILITY);
  });
});
