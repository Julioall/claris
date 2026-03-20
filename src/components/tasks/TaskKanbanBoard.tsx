import { useState, type DragEvent, type MouseEvent } from 'react';
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

const TASK_DRAG_MIME = 'application/x-claris-task';

export function TaskKanbanBoard({
  tasks,
  isLoading,
  onEdit,
  onDelete,
  onStatusChange,
  onTaskClick,
  onCreateInColumn,
}: TaskKanbanBoardProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<TaskStatus | null>(null);

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

  const clearDragState = () => {
    setDraggingTaskId(null);
    setDropTargetStatus(null);
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, task: Task) => {
    setDraggingTaskId(task.id);
    setDropTargetStatus(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(TASK_DRAG_MIME, task.id);
    event.dataTransfer.setData('text/plain', task.id);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, status: TaskStatus) => {
    if (!draggingTaskId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const draggedTask = tasks.find(task => task.id === draggingTaskId);
    const nextDropTarget = draggedTask?.status === status ? null : status;

    if (dropTargetStatus !== nextDropTarget) {
      setDropTargetStatus(nextDropTarget);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, status: TaskStatus) => {
    event.preventDefault();

    const taskId = event.dataTransfer.getData(TASK_DRAG_MIME) || draggingTaskId;
    const draggedTask = tasks.find(task => task.id === taskId);

    clearDragState();

    if (!draggedTask || draggedTask.status === status) return;

    onStatusChange(draggedTask.id, status);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>, status: TaskStatus) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    if (dropTargetStatus === status) {
      setDropTargetStatus(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {COLUMNS.map(col => {
        const colTasks = tasksByStatus(col.status);
        const isDropTarget = dropTargetStatus === col.status;
        return (
          <div
            key={col.status}
            role="region"
            aria-label={`Coluna ${col.label}`}
            onDragOver={event => handleDragOver(event, col.status)}
            onDrop={event => handleDrop(event, col.status)}
            onDragLeave={event => handleDragLeave(event, col.status)}
            className={cn(
              'flex flex-col rounded-lg border-2 min-h-[300px] transition-colors',
              col.color,
              isDropTarget && 'border-primary bg-primary/5'
            )}
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
                <div
                  className={cn(
                    'flex h-24 items-center justify-center rounded border border-dashed text-xs text-muted-foreground transition-colors',
                    isDropTarget && 'border-primary/60 text-primary'
                  )}
                >
                  {isDropTarget ? 'Solte a tarefa aqui' : 'Nenhuma tarefa'}
                </div>
              ) : (
                colTasks.map(task => (
                  <div
                    key={task.id}
                    draggable
                    aria-grabbed={draggingTaskId === task.id}
                    onDragStart={event => handleDragStart(event, task)}
                    onDragEnd={clearDragState}
                    className={cn(
                      'rounded-lg cursor-grab active:cursor-grabbing',
                      draggingTaskId === task.id && 'cursor-grabbing',
                      draggingTaskId === task.id && 'opacity-60'
                    )}
                  >
                    <TaskCard
                      task={task}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onStatusChange={onStatusChange}
                      onClick={onTaskClick}
                      className={cn(
                        'cursor-grab active:cursor-grabbing',
                        draggingTaskId === task.id && 'cursor-grabbing'
                      )}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
