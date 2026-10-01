/**
 * Modulity 2.0 — Event Bus
 *
 * Synchronous in-process event bus. Producers emit events, consumers subscribe.
 * The contract remains the same for later distribution.
 *
 * Events follow the envelope schema defined in docs/EVENT_MODEL.md.
 */

import { generateId } from '../utils/generateId.js';

/**
 * Creates an event envelope.
 *
 * @param {Object} params
 * @param {string} params.eventType
 * @param {string|null} params.organizationId
 * @param {string|null} params.workspaceId
 * @param {Object} params.actor          — { type: 'user'|'system', id: string }
 * @param {Object} params.payload
 * @param {string|null} params.correlationId
 * @param {string|null} params.causationId
 * @returns {Object}
 */
export function createEvent({
  eventType,
  organizationId = null,
  workspaceId = null,
  actor,
  payload = {},
  correlationId = null,
  causationId = null,
}) {
  return Object.freeze({
    eventId: `evt:${generateId()}`,
    eventType,
    schemaVersion: '1.0.0',
    organizationId,
    workspaceId,
    timestamp: new Date().toISOString(),
    correlationId: correlationId || `corr:${generateId()}`,
    causationId,
    actor,
    payload,
    metadata: {
      source: 'web',
    },
  });
}

/**
 * Creates an in-process event bus.
 *
 * @returns {{ emit: Function, on: Function, off: Function }}
 */
export function createEventBus() {
  const listeners = new Map();

  function on(eventType, callback) {
    if (!listeners.has(eventType)) {
      listeners.set(eventType, new Set());
    }
    listeners.get(eventType).add(callback);
    return () => off(eventType, callback);
  }

  function off(eventType, callback) {
    const set = listeners.get(eventType);
    if (set) {
      set.delete(callback);
    }
  }

  function emit(event) {
    const set = listeners.get(event.eventType);
    if (set) {
      for (const callback of set) {
        try {
          callback(event);
        } catch (err) {
          console.error(`[eventBus] Error in listener for ${event.eventType}:`, err);
        }
      }
    }

    const wildcardSet = listeners.get('*');
    if (wildcardSet) {
      for (const callback of wildcardSet) {
        try {
          callback(event);
        } catch (err) {
          console.error('[eventBus] Error in wildcard listener:', err);
        }
      }
    }
  }

  return { emit, on, off };
}

/** Singleton event bus for the application. */
export const eventBus = createEventBus();
