/**
 * Display Formatter — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { formatDisplayValue } from './displayFormatter.js';

describe('formatDisplayValue', () => {
  it('returns dash for undefined/null/empty', () => {
    expect(formatDisplayValue(undefined, { type: 'text' })).toBe('—');
    expect(formatDisplayValue(null, { type: 'text' })).toBe('—');
    expect(formatDisplayValue('', { type: 'text' })).toBe('—');
  });

  it('formats boolean fields', () => {
    expect(formatDisplayValue(true, { type: 'boolean' })).toBe('Yes');
    expect(formatDisplayValue(false, { type: 'boolean' })).toBe('No');
  });

  it('formats date fields', () => {
    const result = formatDisplayValue('2024-06-15', { type: 'date' });
    // Locale-dependent, but should contain 2024
    expect(result).toContain('2024');
  });

  it('formats select with {value, label} options', () => {
    const result = formatDisplayValue('FULL', {
      type: 'select',
      options: [
        { value: 'FULL', label: 'Full Tank' },
        { value: 'HALF', label: 'Half Tank' },
      ],
    });
    expect(result).toBe('Full Tank');
  });

  it('formats select with string options', () => {
    const result = formatDisplayValue('GOOD', {
      type: 'select',
      options: ['GOOD', 'BAD'],
    });
    expect(result).toBe('GOOD');
  });

  it('formats entity reference with context', () => {
    const result = formatDisplayValue(
      { entityId: 'e-1', entityTypeId: 'ROOM', workspaceId: 'ws-1' },
      { type: 'entity-reference' },
      { entityNames: { 'e-1': 'Room 101' } },
    );
    expect(result).toBe('Room 101');
  });

  it('formats entity reference without context', () => {
    const result = formatDisplayValue(
      { entityId: 'abcdefgh-1234-5678-9012', entityTypeId: 'ROOM', workspaceId: 'ws-1' },
      { type: 'entity-reference' },
    );
    expect(result).toContain('Entity');
  });

  it('formats number with locale', () => {
    const result = formatDisplayValue(1234, { type: 'number' });
    expect(result).toBeTruthy();
  });

  it('formats text as string', () => {
    expect(formatDisplayValue('Hello', { type: 'text' })).toBe('Hello');
  });
});
