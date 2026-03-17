import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Edit2, Trash2, Tag as TagIcon, Sparkles } from 'lucide-react';
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

  // Combine relation tags and AI text tags for display
  const relationTagLabels = (task.tags ?? []).map(t => t.label);
  const aiTagLabels = (task.ai_tags ?? []).filter(t => !relationTagLabels.includes(t));
  const allTagLabels = [...relationTagLabels, ...aiTagLabels];

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
          <div className="flex items-center gap-1.5">
            <p className={cn('font-medium text-sm leading-snug', task.status === 'done' && 'line-through text-muted-foreground')}>
              {task.title}
            </p>
            {task.suggested_by_ai && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 gap-0.5 text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800">
                <Sparkles className="h-2.5 w-2.5" />
                IA
              </Badge>
            )}
          </div>

          {task.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
          )}

          {task.origin_reason && (
            <p className="mt-0.5 text-xs text-muted-foreground/60 italic line-clamp-1">{task.origin_reason}</p>
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

            {allTagLabels.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <TagIcon className="h-3 w-3" />
                {allTagLabels.slice(0, 3).join(', ')}
                {allTagLabels.length > 3 && ` +${allTagLabels.length - 3}`}
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
