/**
 * Modulity 2.0 — Calendar date utilities
 *
 * Centralizes the Monday-first week convention and date-only preservation
 * used across all Calendar views. These helpers are pure; they do not mutate
 * canonical Record values.
 */

export const WEEKDAYS_MONDAY_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG_MONDAY_FIRST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function addYears(date, years) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

export function startOfWeekMondayFirst(date) {
  const day = date.getDay(); // 0 = Sunday ... 6 = Saturday
  const offset = day === 0 ? -6 : 1 - day; // Monday is the first day
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), offset);
}

export function endOfWeekMondayFirst(date) {
  return addDays(startOfWeekMondayFirst(date), 6);
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function parseEventDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
}

export function isInRange(event, date) {
  const start = parseEventDate(event.start);
  let end = event.end ? parseEventDate(event.end) : start;
  if (event.allDay && event.end && /^\d{4}-\d{2}-\d{2}$/.test(event.end)) {
    // For date-only inclusive end dates, extend to the end of that day so the
    // event visually intersects every calendar date within the inclusive range.
    end = new Date(`${event.end}T23:59:59`);
  }
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  return start <= dayEnd && end >= dayStart;
}

export function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function getMonthGridDays(currentDate) {
  const firstOfMonth = startOfMonth(currentDate);
  const start = startOfWeekMondayFirst(firstOfMonth);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    days.push(addDays(start, i));
  }
  return days;
}

export function getYearMonthDates(year) {
  const months = [];
  for (let month = 0; month < 12; month += 1) {
    months.push(new Date(year, month, 1));
  }
  return months;
}

export function formatEventTime(event, options = {}) {
  if (event.allDay) return null;
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return null;
  const { showEnd = false } = options;
  const startTime = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (!showEnd || !event.end) return startTime;
  const end = new Date(event.end);
  if (Number.isNaN(end.getTime())) return startTime;
  const endTime = end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${startTime}–${endTime}`;
}
