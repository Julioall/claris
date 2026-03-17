import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Edit2, Trash2, Tag as TagIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from '@/types';
import { format, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  high: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

interface TaskCardProps {
  task: Task;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  onStatusChange?: (id: string, status: Task['status']) => void;
  onClick?: (task: Task) => void;
}

export function TaskCard({ task, onEdit, onDelete, onStatusChange, onClick }: TaskCardProps) {
  const isOverdue = task.due_date && task.status !== 'done' && isPast(parseISO(task.due_date));

  return (
    <div
      className={cn(
        'group rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md',
        task.status === 'done' && 'opacity-70',
        onClick && 'cursor-pointer'
      )}
      onClick={() => onClick?.(task)}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.status === 'done'}
          onChange={e => {
            e.stopPropagation();
            onStatusChange?.(task.id, e.target.checked ? 'done' : 'todo');
          }}
          onClick={e => e.stopPropagation()}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded accent-primary"
          aria-label={task.status === 'done' ? 'Marcar como pendente' : 'Marcar como concluído'}
        />

        <div className="flex-1 min-w-0">
          <p className={cn('font-medium text-sm leading-snug', task.status === 'done' && 'line-through text-muted-foreground')}>
            {task.title}
          </p>

          {task.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', PRIORITY_STYLES[task.priority])}>
              {PRIORITY_LABELS[task.priority]}
            </span>

            {task.due_date && (
              <span className={cn('flex items-center gap-1 text-xs', isOverdue ? 'text-destructive' : 'text-muted-foreground')}>
                <Calendar className="h-3 w-3" />
                {format(parseISO(task.due_date), 'd MMM', { locale: ptBR })}
                {isOverdue && ' · Atrasada'}
              </span>
            )}

            {task.tags && task.tags.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <TagIcon className="h-3 w-3" />
                {task.tags.slice(0, 2).map(t => t.label).join(', ')}
                {task.tags.length > 2 && ` +${task.tags.length - 2}`}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {onEdit && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(task)}>
              <Edit2 className="h-3.5 w-3.5" />
              <span className="sr-only">Editar</span>
            </Button>
          )}
          {onDelete && (
            <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={() => onDelete(task.id)}>
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Remover</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
