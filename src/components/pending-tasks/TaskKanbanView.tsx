import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRight, CheckCircle2, Clock, ExternalLink, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import { TaskStatus } from '@/types';

interface KanbanTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: 'baixa' | 'media' | 'alta' | 'urgente';
  task_type: 'moodle' | 'interna';
  due_date?: string;
  student_id?: string;
  student?: {
    full_name: string;
  };
  course?: {
    short_name: string;
  };
  is_recurring?: boolean;
}

interface TaskKanbanViewProps {
  tasks: KanbanTask[];
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void> | void;
}

const columns: Array<{
  value: TaskStatus;
  title: string;
  description: string;
  className: string;
}> = [
  {
    value: 'aberta',
    title: 'A fazer',
    description: 'Itens que ainda nao foram iniciados.',
    className: 'border-l-sky-500',
  },
  {
    value: 'em_andamento',
    title: 'Em andamento',
    description: 'Itens com trabalho em curso.',
    className: 'border-l-amber-500',
  },
  {
    value: 'resolvida',
    title: 'Concluido',
    description: 'Itens finalizados ou fechados.',
    className: 'border-l-emerald-500',
  },
];

function getDueDateLabel(date?: string) {
  if (!date) return null;

  const parsedDate = new Date(date);
  if (isToday(parsedDate)) return 'Hoje';

  return format(parsedDate, "dd 'de' MMM", { locale: ptBR });
}

function getNextStatus(task: KanbanTask) {
  if (task.status === 'aberta') return 'em_andamento' as const;
  if (task.status === 'em_andamento') return 'resolvida' as const;
  return 'aberta' as const;
}

function getActionLabel(task: KanbanTask) {
  if (task.status === 'aberta') return 'Iniciar';
  if (task.status === 'em_andamento') return 'Concluir';
  return 'Reabrir';
}

function getActionIcon(task: KanbanTask) {
  if (task.status === 'aberta') return ArrowRight;
  if (task.status === 'em_andamento') return CheckCircle2;
  return RotateCcw;
}

export function TaskKanbanView({ tasks, onStatusChange }: TaskKanbanViewProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {columns.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.value);

        return (
          <section
            key={column.value}
            className={cn(
              'rounded-2xl border border-border/60 bg-muted/20 p-3',
              draggedTaskId && 'transition-colors',
            )}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!draggedTaskId) return;
              void onStatusChange(draggedTaskId, column.value);
              setDraggedTaskId(null);
            }}
          >
            <Card className={cn('border-l-4 shadow-sm', column.className)}>
              <CardHeader className="space-y-2 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{column.title}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{column.description}</p>
                  </div>
                  <Badge variant="secondary">{columnTasks.length}</Badge>
                </div>
              </CardHeader>
            </Card>

            <div className="mt-3 space-y-3">
              {columnTasks.map((task) => {
                const isOverdue = Boolean(
                  task.due_date && task.status !== 'resolvida' && isPast(new Date(task.due_date)),
                );
                const ActionIcon = getActionIcon(task);

                return (
                  <Card
                    key={task.id}
                    draggable
                    onDragStart={() => setDraggedTaskId(task.id)}
                    onDragEnd={() => setDraggedTaskId(null)}
                    className={cn(
                      'cursor-grab border border-border/70 shadow-sm transition-shadow hover:shadow-md',
                      isOverdue && 'border-destructive/50',
                    )}
                  >
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium leading-snug">{task.title}</p>
                            <Badge variant="outline" className="text-xs">
                              {task.task_type === 'moodle' ? 'Moodle' : 'Interna'}
                            </Badge>
                            {task.is_recurring && (
                              <Badge variant="secondary" className="text-xs">
                                Rotina
                              </Badge>
                            )}
                          </div>

                          {(task.student || task.course) && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                              {task.student && <span>{task.student.full_name}</span>}
                              {task.student && task.course && <span>|</span>}
                              {task.course && <span>{task.course.short_name}</span>}
                            </div>
                          )}
                        </div>

                        {task.student_id && (
                          <Button size="icon" variant="ghost" asChild>
                            <Link to={`/alunos/${task.student_id}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                      </div>

                      {task.description && (
                        <p className="line-clamp-3 text-sm text-muted-foreground">
                          {task.description.replace(/<[^>]*>/g, '')}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={task.status} size="sm" />
                        <PriorityBadge priority={task.priority} size="sm" />
                        {task.due_date && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-xs',
                              isOverdue ? 'font-medium text-destructive' : 'text-muted-foreground',
                            )}
                          >
                            <Clock className="h-3.5 w-3.5" />
                            {getDueDateLabel(task.due_date)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          Arraste para mover entre colunas
                        </span>
                        <Button
                          size="sm"
                          variant={task.status === 'resolvida' ? 'outline' : 'default'}
                          onClick={() => void onStatusChange(task.id, getNextStatus(task))}
                        >
                          <ActionIcon className="mr-2 h-4 w-4" />
                          {getActionLabel(task)}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {columnTasks.length === 0 && (
                <Card className="border-dashed bg-background/60 shadow-none">
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    Nenhuma tarefa nesta coluna.
                  </CardContent>
                </Card>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
