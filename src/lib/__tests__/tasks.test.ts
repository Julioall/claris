import { describe, expect, it } from 'vitest';
import { matchesTaskDateWindow, normalizeTaskPriority, normalizeTaskStatus } from '../tasks';

describe('task normalization', () => {
  it('keeps current task statuses unchanged', () => {
    expect(normalizeTaskStatus('todo')).toBe('todo');
    expect(normalizeTaskStatus('in_progress')).toBe('in_progress');
    expect(normalizeTaskStatus('done')).toBe('done');
  });

  it('maps pending_tasks statuses to task statuses', () => {
    expect(normalizeTaskStatus('aberta')).toBe('todo');
    expect(normalizeTaskStatus('em_andamento')).toBe('in_progress');
    expect(normalizeTaskStatus('resolvida')).toBe('done');
  });

  it('keeps current task priorities unchanged', () => {
    expect(normalizeTaskPriority('low')).toBe('low');
    expect(normalizeTaskPriority('medium')).toBe('medium');
    expect(normalizeTaskPriority('high')).toBe('high');
    expect(normalizeTaskPriority('urgent')).toBe('urgent');
  });

  it('maps pending_tasks priorities to task priorities', () => {
    expect(normalizeTaskPriority('baixa')).toBe('low');
    expect(normalizeTaskPriority('media')).toBe('medium');
    expect(normalizeTaskPriority('alta')).toBe('high');
    expect(normalizeTaskPriority('urgente')).toBe('urgent');
  });

  it('falls back to defaults for unknown values', () => {
    expect(normalizeTaskStatus('unknown')).toBe('todo');
    expect(normalizeTaskPriority('unknown')).toBe('medium');
    expect(normalizeTaskStatus(undefined)).toBe('todo');
    expect(normalizeTaskPriority(undefined)).toBe('medium');
  });

  it('matches due dates against the selected task period window', () => {
    const referenceDate = new Date('2026-03-20T12:00:00');

    expect(matchesTaskDateWindow('2026-03-20', 'day', referenceDate)).toBe(true);
    expect(matchesTaskDateWindow('2026-03-21', 'day', referenceDate)).toBe(false);
    expect(matchesTaskDateWindow('2026-03-21', 'week', referenceDate)).toBe(true);
    expect(matchesTaskDateWindow('2026-03-30', 'week', referenceDate)).toBe(false);
    expect(matchesTaskDateWindow('2026-03-30', 'month', referenceDate)).toBe(true);
    expect(matchesTaskDateWindow('2026-04-01', 'month', referenceDate)).toBe(false);
    expect(matchesTaskDateWindow(undefined, 'all', referenceDate)).toBe(true);
    expect(matchesTaskDateWindow(undefined, 'day', referenceDate)).toBe(false);
  });
});
