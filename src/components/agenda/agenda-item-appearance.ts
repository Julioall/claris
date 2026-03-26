import type { ElementType } from 'react';
import {
  AlignLeft,
  GraduationCap,
  HelpCircle,
  ListTodo,
  PackageCheck,
  Users,
  Video,
} from 'lucide-react';
import type { CalendarEventType } from '@/features/agenda/types';

export interface AgendaItemAppearance {
  label: string;
  icon: ElementType;
  tone: string;
}

export const CALENDAR_EVENT_APPEARANCE: Record<CalendarEventType, AgendaItemAppearance> = {
  manual: {
    label: 'Geral',
    icon: AlignLeft,
    tone: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-200 dark:border-slate-800',
  },
  webclass: {
    label: 'WebAula',
    icon: Video,
    tone: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-800',
  },
  meeting: {
    label: 'Reuniao',
    icon: Users,
    tone: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-800',
  },
  alignment: {
    label: 'Alinhamento',
    icon: Users,
    tone: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800',
  },
  delivery: {
    label: 'Entrega',
    icon: PackageCheck,
    tone: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800',
  },
  training: {
    label: 'Treinamento',
    icon: GraduationCap,
    tone: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-900/40 dark:text-fuchsia-200 dark:border-fuchsia-800',
  },
  other: {
    label: 'Outro',
    icon: HelpCircle,
    tone: 'bg-stone-100 text-stone-800 border-stone-200 dark:bg-stone-900/40 dark:text-stone-200 dark:border-stone-800',
  },
};

export const AGENDA_TASK_APPEARANCE: AgendaItemAppearance = {
  label: 'Tarefa',
  icon: ListTodo,
  tone: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-800',
};
