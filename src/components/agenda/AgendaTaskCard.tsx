import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from '@/features/tasks/types';
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/tasks';
import { AGENDA_TASK_APPEARANCE } from './agenda-item-appearance';
import { endOfDay, format, isPast, isToday, isTomorrow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AgendaTaskCardProps {
  task: Task;
  onClick?: (task: Task) => void;
}

function formatTaskDueDate(dueDate: string) {
  const parsedDate = parseISO(dueDate);

  if (isToday(parsedDate)) return 'Hoje';
  if (isTomorrow(parsedDate)) return 'Amanha';

  return format(parsedDate, "d MMM yyyy", { locale: ptBR });
}

export function AgendaTaskCard({ task, onClick }: AgendaTaskCardProps) {
  const Icon = AGENDA_TASK_APPEARANCE.icon;
  const isOverdue = Boolean(task.due_date) && task.status !== 'done' && isPast(endOfDay(parseISO(task.due_date!)));

  return (
    <button
      type="button"
      onClick={() => onClick?.(task)}
      className={cn(
        'group flex w-full items-start gap-4 rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md',
        task.status === 'done' && 'opacity-70',
      )}
    >
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border', AGENDA_TASK_APPEARANCE.tone)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm font-medium leading-snug', task.status === 'done' && 'line-through text-muted-foreground')}>
            {task.title}
          </p>
          <Badge variant="outline" className={cn('shrink-0 text-[11px]', AGENDA_TASK_APPEARANCE.tone)}>
            {AGENDA_TASK_APPEARANCE.label}
          </Badge>
        </div>

        {task.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {task.due_date && (
            <span className={cn('flex items-center gap-1', isOverdue && 'text-destructive')}>
              <Clock className="h-3 w-3" />
              {formatTaskDueDate(task.due_date)}
              {isOverdue && ' · Atrasada'}
            </span>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {TASK_STATUS_LABELS[task.status]}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {TASK_PRIORITY_LABELS[task.priority]}
          </Badge>
        </div>
      </div>
    </button>
  );
}
