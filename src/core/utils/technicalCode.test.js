import { describe, expect, it } from 'vitest';
import {
  generateTechnicalCode,
  resolveCodeCollision,
  suggestTechnicalCode,
} from './technicalCode.js';

describe('technicalCode', () => {
  it('normalizes display labels to UPPER_SNAKE codes', () => {
    expect(generateTechnicalCode('Holiday Request')).toBe('HOLIDAY_REQUEST');
    expect(generateTechnicalCode('Front Office')).toBe('FRONT_OFFICE');
    expect(generateTechnicalCode('Room Inspection')).toBe('ROOM_INSPECTION');
    expect(generateTechnicalCode('  goods-receipt! 2026 ')).toBe('GOODS_RECEIPT_2026');
    expect(generateTechnicalCode('Étkezés Terv')).toBe('ETKEZES_TERV'); // diacritics stripped
  });

  it('falls back safely for empty or digit-leading labels', () => {
    expect(generateTechnicalCode('')).toBe('ITEM');
    expect(generateTechnicalCode('   ')).toBe('ITEM');
    expect(generateTechnicalCode('123 Orders')).toBe('ITEM_123_ORDERS'); // must start with a letter
  });

  it('is deterministic — the same label always yields the same code', () => {
    expect(generateTechnicalCode('Vehicle Inspection')).toBe(generateTechnicalCode('Vehicle Inspection'));
  });

  it('resolves collisions with numeric suffixes', () => {
    expect(resolveCodeCollision('HOLIDAY_REQUEST', [])).toBe('HOLIDAY_REQUEST');
    expect(resolveCodeCollision('HOLIDAY_REQUEST', ['HOLIDAY_REQUEST'])).toBe('HOLIDAY_REQUEST_2');
    expect(resolveCodeCollision('HOLIDAY_REQUEST', ['HOLIDAY_REQUEST', 'HOLIDAY_REQUEST_2'])).toBe('HOLIDAY_REQUEST_3');
  });

  it('suggestTechnicalCode combines both steps', () => {
    expect(suggestTechnicalCode('Night Shift', ['NIGHT_SHIFT'])).toBe('NIGHT_SHIFT_2');
  });
});
