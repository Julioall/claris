import { type MouseEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Task, TaskStatus } from '@/types';
import { TaskCard } from './TaskCard';

interface Column {
  status: TaskStatus;
  label: string;
  color: string;
  headerClass: string;
}

const COLUMNS: Column[] = [
  {
    status: 'todo',
    label: 'A fazer',
    color: 'border-slate-300 dark:border-slate-600',
    headerClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  },
  {
    status: 'in_progress',
    label: 'Em andamento',
    color: 'border-blue-300 dark:border-blue-700',
    headerClass: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  },
  {
    status: 'done',
    label: 'Concluído',
    color: 'border-green-300 dark:border-green-700',
    headerClass: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  },
];

interface TaskKanbanBoardProps {
  tasks: Task[];
  isLoading?: boolean;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
  onCreateInColumn?: (status: TaskStatus) => void;
}

export function TaskKanbanBoard({
  tasks,
  isLoading,
  onEdit,
  onDelete,
  onStatusChange,
  onTaskClick,
  onCreateInColumn,
}: TaskKanbanBoardProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[400px]">
        {COLUMNS.map(col => (
          <div key={col.status} className={cn('rounded-lg border-2 border-dashed p-4 animate-pulse', col.color)}>
            <div className="h-6 rounded bg-muted w-24 mb-4" />
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-24 rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const tasksByStatus = (status: TaskStatus) =>
    tasks.filter(t => t.status === status);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {COLUMNS.map(col => {
        const colTasks = tasksByStatus(col.status);
        return (
          <div
            key={col.status}
            className={cn('flex flex-col rounded-lg border-2 min-h-[300px]', col.color)}
          >
            {/* Column header */}
            <div className={cn('flex items-center justify-between rounded-t-md px-3 py-2', col.headerClass)}>
              <span className="text-xs font-semibold uppercase tracking-wider">{col.label}</span>
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {colTasks.length}
                </Badge>
                {onCreateInColumn && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={(e: MouseEvent) => { e.stopPropagation(); onCreateInColumn(col.status); }}
                    title={`Nova tarefa em "${col.label}"`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 space-y-2 p-2">
              {colTasks.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded border border-dashed text-xs text-muted-foreground">
                  Nenhuma tarefa
                </div>
              ) : (
                colTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onStatusChange={onStatusChange}
                    onClick={onTaskClick}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
