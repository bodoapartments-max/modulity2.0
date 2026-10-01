import { describe, it, expect } from 'vitest';
import { createEntity, createEntityReference, validateEntityReference, ENTITY_STATUSES } from './entity.js';

describe('entity', () => {
  const actorRef = { actorType: 'USER', actorId: 'user-1' };

  const baseArgs = {
    entityId: 'entity-1',
    workspaceId: 'ws-1',
    entityTypeId: 'type-1',
    displayName: 'Test Entity',
    createdBy: actorRef,
  };

  it('creates a valid entity', () => {
    const entity = createEntity({ ...baseArgs, data: { name: 'Test' } });
    expect(entity.entityId).toBe('entity-1');
    expect(entity.displayName).toBe('Test Entity');
    expect(entity.status).toBe('ACTIVE');
    expect(entity.data.name).toBe('Test');
  });

  it('defaults status to ACTIVE', () => {
    const entity = createEntity(baseArgs);
    expect(entity.status).toBe(ENTITY_STATUSES.ACTIVE);
  });

  it('rejects a missing entityId', () => {
    expect(() => createEntity({ ...baseArgs, entityId: '' })).toThrow('entityId is required');
  });

  it('rejects a missing workspaceId', () => {
    expect(() => createEntity({ ...baseArgs, workspaceId: '' })).toThrow('workspaceId is required');
  });

  it('rejects a missing entityTypeId', () => {
    expect(() => createEntity({ ...baseArgs, entityTypeId: '' })).toThrow('entityTypeId is required');
  });

  it('rejects a missing displayName', () => {
    expect(() => createEntity({ ...baseArgs, displayName: '' })).toThrow('displayName is required');
  });

  it('rejects a missing createdBy', () => {
    expect(() => createEntity({ ...baseArgs, createdBy: null })).toThrow('createdBy is required');
  });

  it('rejects an invalid status', () => {
    expect(() => createEntity({ ...baseArgs, status: 'PENDING' })).toThrow('Invalid entity status: PENDING');
  });

  it('returns a frozen result', () => {
    const entity = createEntity(baseArgs);
    expect(Object.isFrozen(entity)).toBe(true);
  });

  it('freezes the data object', () => {
    const entity = createEntity({ ...baseArgs, data: { name: 'Test' } });
    expect(Object.isFrozen(entity.data)).toBe(true);
  });

  describe('createEntityReference', () => {
    it('creates a valid reference', () => {
      const ref = createEntityReference({ entityId: 'entity-1', entityTypeId: 'type-1', workspaceId: 'ws-1' });
      expect(ref).toEqual({ entityId: 'entity-1', entityTypeId: 'type-1', workspaceId: 'ws-1' });
    });

    it('rejects a missing entityId', () => {
      expect(() => createEntityReference({ entityTypeId: 'type-1', workspaceId: 'ws-1' })).toThrow('entityId is required for EntityReference');
    });

    it('rejects a missing entityTypeId', () => {
      expect(() => createEntityReference({ entityId: 'entity-1', workspaceId: 'ws-1' })).toThrow('entityTypeId is required for EntityReference');
    });

    it('rejects a missing workspaceId', () => {
      expect(() => createEntityReference({ entityId: 'entity-1', entityTypeId: 'type-1' })).toThrow('workspaceId is required for EntityReference');
    });
  });

  describe('validateEntityReference', () => {
    it('passes for a valid reference', () => {
      const result = validateEntityReference({ entityId: 'e1', entityTypeId: 'et1', workspaceId: 'ws1' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails for null', () => {
      const result = validateEntityReference(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('EntityReference must be an object');
    });

    it('fails for non-object', () => {
      const result = validateEntityReference('not-an-object');
      expect(result.valid).toBe(false);
    });

    it('fails for missing entityId', () => {
      const result = validateEntityReference({ entityTypeId: 'et1', workspaceId: 'ws1' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/entityId is required/);
    });

    it('fails for missing entityTypeId', () => {
      const result = validateEntityReference({ entityId: 'e1', workspaceId: 'ws1' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/entityTypeId is required/);
    });

    it('fails for missing workspaceId', () => {
      const result = validateEntityReference({ entityId: 'e1', entityTypeId: 'et1' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/workspaceId is required/);
    });

    it('fails for non-string entityId', () => {
      const result = validateEntityReference({ entityId: 42, entityTypeId: 'et1', workspaceId: 'ws1' });
      expect(result.valid).toBe(false);
    });
  });
});
