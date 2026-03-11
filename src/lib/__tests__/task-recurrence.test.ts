import { describe, expect, it } from 'vitest';
import {
  calculateNextRecurringDate,
  getWeekdayFromDate,
  isDateOnWeekday,
} from '@/lib/task-recurrence';

describe('task-recurrence', () => {
  it('returns the next weekly occurrence on the configured weekday after the reference date', () => {
    const nextDate = calculateNextRecurringDate({
      pattern: 'semanal',
      startDate: '2026-03-16T00:00:00.000Z',
      referenceDate: '2026-03-19T10:00:00.000Z',
      weeklyDay: 1,
    });

    expect(nextDate.toISOString()).toBe('2026-03-23T00:00:00.000Z');
  });

  it('keeps the monthly cadence anchored to the first occurrence', () => {
    const nextDate = calculateNextRecurringDate({
      pattern: 'mensal',
      startDate: '2026-03-10T00:00:00.000Z',
      referenceDate: '2026-03-27T12:00:00.000Z',
    });

    expect(nextDate.toISOString()).toBe('2026-04-10T00:00:00.000Z');
  });

  it('exposes weekday helpers for the weekly validation flow', () => {
    expect(getWeekdayFromDate('2026-03-20T00:00:00.000Z')).toBe(5);
    expect(isDateOnWeekday('2026-03-20T00:00:00.000Z', 5)).toBe(true);
    expect(isDateOnWeekday('2026-03-20T00:00:00.000Z', 1)).toBe(false);
  });
});
