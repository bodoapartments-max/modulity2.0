/**
 * Modulity 2.0 — Actor Reference
 *
 * Standard typed reference to the actor who performed an operation.
 * Prepared for future agent and integration actors.
 *
 * @module core/data/actorRef
 */

export const ACTOR_TYPES = Object.freeze({
  USER: 'USER',
  INTERNAL_AGENT: 'INTERNAL_AGENT',
  EXTERNAL_INTEGRATION: 'EXTERNAL_INTEGRATION',
});

/**
 * @typedef {Object} ActorRef
 * @property {string} actorType — one of ACTOR_TYPES
 * @property {string} actorId
 */

/**
 * Creates an ActorRef value object.
 *
 * @param {Object} params
 * @returns {ActorRef}
 */
export function createActorRef({ actorType, actorId }) {
  if (!actorType || !ACTOR_TYPES[actorType]) {
    throw new Error(`Invalid actorType: ${actorType}`);
  }
  if (!actorId) throw new Error('actorId is required');

  return Object.freeze({ actorType, actorId });
}

/**
 * Creates a USER actor reference (convenience).
 */
export function userActor(userId) {
  return createActorRef({ actorType: ACTOR_TYPES.USER, actorId: userId });
}
