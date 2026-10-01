import { describe, it, expect } from 'vitest';
import {
  createRelationship,
  RELATIONSHIP_OBJECT_TYPES,
  RELATIONSHIP_TYPES,
  RELATIONSHIP_STATUSES,
} from './relationship.js';

describe('relationship', () => {
  const actorRef = { actorType: 'USER', actorId: 'user-1' };

  const baseArgs = {
    relationshipId: 'rel-1',
    workspaceId: 'ws-1',
    source: { objectType: RELATIONSHIP_OBJECT_TYPES.ENTITY, objectId: 'entity-1' },
    target: { objectType: RELATIONSHIP_OBJECT_TYPES.RECORD, objectId: 'record-1' },
    relationshipType: RELATIONSHIP_TYPES.ASSIGNED_TO,
    createdBy: actorRef,
  };

  it('creates a valid relationship', () => {
    const rel = createRelationship(baseArgs);
    expect(rel.relationshipId).toBe('rel-1');
    expect(rel.source.objectId).toBe('entity-1');
    expect(rel.target.objectId).toBe('record-1');
    expect(rel.relationshipType).toBe('ASSIGNED_TO');
  });

  it('defaults status to ACTIVE', () => {
    const rel = createRelationship(baseArgs);
    expect(rel.status).toBe(RELATIONSHIP_STATUSES.ACTIVE);
  });

  it('rejects a missing relationshipId', () => {
    expect(() => createRelationship({ ...baseArgs, relationshipId: '' })).toThrow('relationshipId is required');
  });

  it('rejects a missing workspaceId', () => {
    expect(() => createRelationship({ ...baseArgs, workspaceId: '' })).toThrow('workspaceId is required');
  });

  it('rejects a missing source', () => {
    expect(() => createRelationship({ ...baseArgs, source: null })).toThrow('source is required');
  });

  it('rejects a missing target', () => {
    expect(() => createRelationship({ ...baseArgs, target: null })).toThrow('target is required');
  });

  it('rejects a missing relationshipType', () => {
    expect(() => createRelationship({ ...baseArgs, relationshipType: '' })).toThrow('relationshipType is required');
  });

  it('rejects a missing createdBy', () => {
    expect(() => createRelationship({ ...baseArgs, createdBy: null })).toThrow('createdBy is required');
  });

  it('rejects an invalid source objectType', () => {
    expect(() =>
      createRelationship({
        ...baseArgs,
        source: { objectType: 'INVALID', objectId: 'entity-1' },
      })
    ).toThrow('Invalid source objectType: INVALID');
  });

  it('rejects an invalid target objectType', () => {
    expect(() =>
      createRelationship({
        ...baseArgs,
        target: { objectType: 'INVALID', objectId: 'record-1' },
      })
    ).toThrow('Invalid target objectType: INVALID');
  });

  it('rejects a missing source.objectId', () => {
    expect(() =>
      createRelationship({
        ...baseArgs,
        source: { objectType: RELATIONSHIP_OBJECT_TYPES.ENTITY, objectId: '' },
      })
    ).toThrow('source.objectId is required');
  });

  it('rejects an invalid status', () => {
    expect(() => createRelationship({ ...baseArgs, status: 'PENDING' })).toThrow('Invalid relationship status: PENDING');
  });

  it('returns a frozen result', () => {
    const rel = createRelationship(baseArgs);
    expect(Object.isFrozen(rel)).toBe(true);
    expect(Object.isFrozen(rel.source)).toBe(true);
    expect(Object.isFrozen(rel.target)).toBe(true);
  });
});
