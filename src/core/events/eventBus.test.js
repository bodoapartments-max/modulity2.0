import { describe, it, expect, vi } from 'vitest';
import { createEventBus, createEvent } from './eventBus.js';

const makeEvent = (overrides = {}) =>
  createEvent({ eventType: 'test.event', actor: { type: 'user', id: 'u1' }, ...overrides });

describe('createEvent', () => {
  it('produces a frozen envelope with correct fields', () => {
    const evt = makeEvent({ payload: { a: 1 } });
    expect(Object.isFrozen(evt)).toBe(true);
    expect(evt.eventId).toMatch(/^evt:/);
    expect(evt.eventType).toBe('test.event');
    expect(evt.schemaVersion).toBe('1.0.0');
    expect(evt.actor).toEqual({ type: 'user', id: 'u1' });
    expect(evt.payload).toEqual({ a: 1 });
    expect(evt.correlationId).toMatch(/^corr:/);
    expect(evt.causationId).toBeNull();
    expect(evt.timestamp).toBeTruthy();
  });
});

describe('createEventBus', () => {
  it('emit calls registered listeners', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('test.event', cb);
    const evt = makeEvent();
    bus.emit(evt);
    expect(cb).toHaveBeenCalledWith(evt);
  });

  it('wildcard listener receives all events', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('*', cb);
    bus.emit(makeEvent({ eventType: 'a' }));
    bus.emit(makeEvent({ eventType: 'b' }));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('off removes listener', () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on('test.event', cb);
    bus.off('test.event', cb);
    bus.emit(makeEvent());
    expect(cb).not.toHaveBeenCalled();
  });

  it('listener errors do not prevent other listeners from running', () => {
    const bus = createEventBus();
    const good = vi.fn();
    bus.on('test.event', () => {
      throw new Error('boom');
    });
    bus.on('test.event', good);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.emit(makeEvent());
    expect(good).toHaveBeenCalled();
    spy.mockRestore();
  });
});
