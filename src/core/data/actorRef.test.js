import { describe, it, expect } from 'vitest';
import { createActorRef, userActor, ACTOR_TYPES } from './actorRef.js';

describe('actorRef', () => {
  it('creates a valid USER actor', () => {
    const actor = createActorRef({ actorType: ACTOR_TYPES.USER, actorId: 'user-1' });
    expect(actor).toEqual({ actorType: 'USER', actorId: 'user-1' });
  });

  it('creates a valid INTERNAL_AGENT actor', () => {
    const actor = createActorRef({ actorType: ACTOR_TYPES.INTERNAL_AGENT, actorId: 'agent-1' });
    expect(actor).toEqual({ actorType: 'INTERNAL_AGENT', actorId: 'agent-1' });
  });

  it('creates a valid EXTERNAL_INTEGRATION actor', () => {
    const actor = createActorRef({ actorType: ACTOR_TYPES.EXTERNAL_INTEGRATION, actorId: 'integration-1' });
    expect(actor).toEqual({ actorType: 'EXTERNAL_INTEGRATION', actorId: 'integration-1' });
  });

  it('rejects a missing actorType', () => {
    expect(() => createActorRef({ actorId: 'user-1' })).toThrow('Invalid actorType: undefined');
  });

  it('rejects an invalid actorType', () => {
    expect(() => createActorRef({ actorType: 'SYSTEM', actorId: 'user-1' })).toThrow('Invalid actorType: SYSTEM');
  });

  it('rejects a missing actorId', () => {
    expect(() => createActorRef({ actorType: ACTOR_TYPES.USER })).toThrow('actorId is required');
  });

  it('creates a correct USER reference with userActor', () => {
    const actor = userActor('user-1');
    expect(actor).toEqual({ actorType: 'USER', actorId: 'user-1' });
  });

  it('returns a frozen object', () => {
    const actor = createActorRef({ actorType: ACTOR_TYPES.USER, actorId: 'user-1' });
    expect(Object.isFrozen(actor)).toBe(true);
  });
});
