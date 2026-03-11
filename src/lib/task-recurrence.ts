import { addDays, addMonths, addWeeks, isAfter } from 'date-fns';
import { RecurrencePattern, RecurrenceWeekday } from '@/types';

export const recurrencePatternOptions: Array<{
  value: RecurrencePattern;
  label: string;
  helper: string;
}> = [
  { value: 'diario', label: 'Diario', helper: 'Repete todos os dias na mesma agenda' },
  { value: 'semanal', label: 'Semanal', helper: 'Repete toda semana no dia escolhido' },
  { value: 'quinzenal', label: 'Quinzenal', helper: 'Repete a cada 2 semanas mantendo a agenda' },
  { value: 'mensal', label: 'Mensal', helper: 'Repete todo mes seguindo a data da primeira ocorrencia' },
  { value: 'bimestral', label: 'Bimestral', helper: 'Repete a cada 2 meses seguindo a primeira ocorrencia' },
  { value: 'trimestral', label: 'Trimestral', helper: 'Repete a cada 3 meses seguindo a primeira ocorrencia' },
];

export const recurrenceWeekdayOptions: Array<{
  value: RecurrenceWeekday;
  label: string;
}> = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terca-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sabado' },
];

interface CalculateNextRecurringDateInput {
  pattern: RecurrencePattern;
  startDate: Date | string;
  referenceDate?: Date | string;
  weeklyDay?: RecurrenceWeekday | null;
}

function normalizeDate(date: Date | string) {
  return typeof date === 'string' ? new Date(date) : new Date(date);
}

function incrementRecurringDate(date: Date, pattern: RecurrencePattern) {
  switch (pattern) {
    case 'diario':
      return addDays(date, 1);
    case 'semanal':
      return addWeeks(date, 1);
    case 'quinzenal':
      return addWeeks(date, 2);
    case 'mensal':
      return addMonths(date, 1);
    case 'bimestral':
      return addMonths(date, 2);
    case 'trimestral':
      return addMonths(date, 3);
    default:
      return addWeeks(date, 1);
  }
}

function getFirstWeeklyOccurrence(startDate: Date, weeklyDay: RecurrenceWeekday) {
  const candidate = new Date(startDate);
  const delta = (weeklyDay - candidate.getUTCDay() + 7) % 7;
  candidate.setUTCDate(candidate.getUTCDate() + delta);
  return candidate;
}

export function getWeekdayFromDate(date: Date | string) {
  return normalizeDate(date).getUTCDay() as RecurrenceWeekday;
}

export function isDateOnWeekday(date: Date | string, weekday: RecurrenceWeekday) {
  return getWeekdayFromDate(date) === weekday;
}

export function calculateNextRecurringDate({
  pattern,
  startDate,
  referenceDate,
  weeklyDay,
}: CalculateNextRecurringDateInput) {
  const anchor = normalizeDate(startDate);
  const reference = referenceDate ? normalizeDate(referenceDate) : anchor;

  let next = pattern === 'semanal'
    ? getFirstWeeklyOccurrence(anchor, weeklyDay ?? getWeekdayFromDate(anchor))
    : anchor;

  if (isAfter(next, reference)) {
    return next;
  }

  while (!isAfter(next, reference)) {
    next = incrementRecurringDate(next, pattern);
  }

  return next;
}

export function getRecurrencePatternLabel(pattern: RecurrencePattern) {
  return recurrencePatternOptions.find((option) => option.value === pattern)?.label ?? pattern;
}
