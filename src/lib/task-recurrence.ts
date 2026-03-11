import { addDays, addMonths, addWeeks } from 'date-fns';
import { RecurrencePattern } from '@/types';

export const recurrencePatternOptions: Array<{
  value: RecurrencePattern;
  label: string;
  helper: string;
}> = [
  { value: 'diario', label: 'Diario', helper: 'Repete todo dia apos concluir' },
  { value: 'semanal', label: 'Semanal', helper: 'Repete 7 dias apos concluir' },
  { value: 'quinzenal', label: 'Quinzenal', helper: 'Repete 14 dias apos concluir' },
  { value: 'mensal', label: 'Mensal', helper: 'Repete 1 mes apos concluir' },
  { value: 'bimestral', label: 'Bimestral', helper: 'Repete 2 meses apos concluir' },
  { value: 'trimestral', label: 'Trimestral', helper: 'Repete 3 meses apos concluir' },
];

export function calculateNextRecurringDate(
  baseDate: Date | string,
  pattern: RecurrencePattern,
) {
  const anchor = typeof baseDate === 'string' ? new Date(baseDate) : baseDate;

  switch (pattern) {
    case 'diario':
      return addDays(anchor, 1);
    case 'semanal':
      return addWeeks(anchor, 1);
    case 'quinzenal':
      return addWeeks(anchor, 2);
    case 'mensal':
      return addMonths(anchor, 1);
    case 'bimestral':
      return addMonths(anchor, 2);
    case 'trimestral':
      return addMonths(anchor, 3);
    default:
      return addWeeks(anchor, 1);
  }
}

export function getRecurrencePatternLabel(pattern: RecurrencePattern) {
  return recurrencePatternOptions.find((option) => option.value === pattern)?.label ?? pattern;
}
