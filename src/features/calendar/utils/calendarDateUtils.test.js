import { describe, expect, it } from 'vitest';
import {
  daysInMonth,
  formatEventTime,
  getMonthGridDays,
  getYearMonthDates,
  isInRange,
  sameDay,
  sameMonth,
  startOfWeekMondayFirst,
  WEEKDAYS_MONDAY_FIRST,
} from './calendarDateUtils.js';

describe('calendarDateUtils — Monday-first convention', () => {
  it('WEEKDAYS_MONDAY_FIRST starts on Monday and ends on Sunday', () => {
    expect(WEEKDAYS_MONDAY_FIRST[0]).toBe('Mon');
    expect(WEEKDAYS_MONDAY_FIRST[6]).toBe('Sun');
  });

  it('startOfWeekMondayFirst returns Monday for a Thursday', () => {
    const thu = new Date('2026-10-15');
    const mon = startOfWeekMondayFirst(thu);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(12);
  });

  it('startOfWeekMondayFirst returns previous Monday for a Sunday', () => {
    const sun = new Date('2026-10-18');
    const mon = startOfWeekMondayFirst(sun);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(12);
  });

  it('getMonthGridDays starts on Monday for a month beginning on Sunday', () => {
    const date = new Date('2026-03-01'); // March 2026 begins on Sunday
    const days = getMonthGridDays(date);
    expect(days[0].getDay()).toBe(1);
    expect(days[0].getDate()).toBe(23); // 23 Feb 2026
  });

  it('getMonthGridDays starts on Monday for a month beginning on Monday', () => {
    const date = new Date('2026-06-01'); // June 2026 begins on Monday
    const days = getMonthGridDays(date);
    expect(days[0].getDay()).toBe(1);
    expect(days[0].getDate()).toBe(1);
  });

  it('month grid has 42 cells', () => {
    const days = getMonthGridDays(new Date('2026-10-15'));
    expect(days).toHaveLength(42);
  });

  it('sameDay compares by calendar date', () => {
    expect(sameDay(new Date('2026-10-10T00:00:00'), new Date('2026-10-10T23:59:59'))).toBe(true);
    expect(sameDay(new Date('2026-10-10'), new Date('2026-10-11'))).toBe(false);
  });

  it('sameMonth compares year and month', () => {
    expect(sameMonth(new Date('2026-10-01'), new Date('2026-10-31'))).toBe(true);
    expect(sameMonth(new Date('2026-10-31'), new Date('2025-10-31'))).toBe(false);
  });

  it('getYearMonthDates returns all twelve months', () => {
    const months = getYearMonthDates(2026);
    expect(months).toHaveLength(12);
    expect(months[0].getMonth()).toBe(0);
    expect(months[11].getMonth()).toBe(11);
  });

  it('daysInMonth handles leap and non-leap February', () => {
    expect(daysInMonth(new Date('2024-02-15'))).toBe(29);
    expect(daysInMonth(new Date('2025-02-15'))).toBe(28);
    expect(daysInMonth(new Date('2026-02-15'))).toBe(28);
  });

  it('isInRange returns true for every day of an inclusive date range', () => {
    const event = { start: '2026-10-10', end: '2026-10-14', allDay: true };
    for (let i = 10; i <= 14; i += 1) {
      expect(isInRange(event, new Date(`2026-10-${i}`))).toBe(true);
    }
    expect(isInRange(event, new Date('2026-10-09'))).toBe(false);
    expect(isInRange(event, new Date('2026-10-15'))).toBe(false);
  });

  it('isInRange does not shift date-only values because of timezone', () => {
    const event = { start: '2026-10-10', end: '2026-10-10', allDay: true };
    expect(isInRange(event, new Date('2026-10-10T12:00:00Z'))).toBe(true);
    expect(isInRange(event, new Date('2026-10-11T00:30:00Z'))).toBe(false);
  });

  it('formatEventTime returns null for all-day events', () => {
    expect(formatEventTime({ allDay: true, start: '2026-10-10' })).toBeNull();
  });

  it('formatEventTime returns start time for timed events', () => {
    const time = formatEventTime({ allDay: false, start: '2026-10-10T09:30:00Z' });
    expect(time).toMatch(/\d{1,2}[:.]\d{2}/);
    expect(time).not.toBe('00:00');
  });

  it('formatEventTime returns range when showEnd is true', () => {
    const time = formatEventTime({ allDay: false, start: '2026-10-10T09:30:00Z', end: '2026-10-10T10:15:00Z' }, { showEnd: true });
    expect(time).toMatch(/\d{1,2}[:.]\d{2}/);
    expect(time).toMatch(/\d{1,2}[:.]\d{2}/);
  });
});
