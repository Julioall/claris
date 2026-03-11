import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  Filter,
  List,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  SquareKanban,
  Trash2,
} from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePendingTasksData } from '@/hooks/usePendingTasksData';
import { NewPendingTaskDialog } from '@/components/pending-tasks/NewPendingTaskDialog';
import { TaskCalendarView } from '@/components/pending-tasks/TaskCalendarView';
import { TaskKanbanView } from '@/components/pending-tasks/TaskKanbanView';
import { TaskStatus } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ViewMode = 'list' | 'calendar' | 'kanban';

const statusCopy: Record<TaskStatus, { title: string; success: string; error: string }> = {
  aberta: {
    title: 'A fazer',
    success: 'Tarefa reaberta.',
    error: 'Nao foi possivel reabrir a tarefa.',
  },
  em_andamento: {
    title: 'Em andamento',
    success: 'Tarefa movida para em andamento.',
    error: 'Nao foi possivel iniciar a tarefa.',
  },
  resolvida: {
    title: 'Concluida',
    success: 'Tarefa concluida.',
    error: 'Nao foi possivel concluir a tarefa.',
  },
};

function formatDueDate(date?: string) {
  if (!date) return null;

  const parsedDate = new Date(date);
  if (isToday(parsedDate)) return 'Hoje';

  return format(parsedDate, "dd 'de' MMM", { locale: ptBR });
}

function isTaskOverdue(date: string | undefined, status: TaskStatus) {
  if (!date || status === 'resolvida') return false;
  return isPast(new Date(date));
}

function stripHtml(value?: string) {
  return value?.replace(/<[^>]*>/g, '') ?? '';
}

export default function PendingTasks() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [isBatchClosing, setIsBatchClosing] = useState(false);

  const {
    tasks,
    courses,
    isLoading,
    updateTaskStatus,
    deleteTask,
    refetch,
  } = usePendingTasksData();

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch = !normalizedQuery
      || task.title.toLowerCase().includes(normalizedQuery)
      || task.student?.full_name?.toLowerCase().includes(normalizedQuery)
      || task.course?.short_name?.toLowerCase().includes(normalizedQuery);

    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesCourse = courseFilter === 'all' || task.course_id === courseFilter;

    return matchesSearch && matchesStatus && matchesCourse;
  }), [courseFilter, searchQuery, statusFilter, tasks]);

  const selectableTasks = filteredTasks.filter((task) => task.status !== 'resolvida');
  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((previousValue) => {
      const nextValue = new Set(previousValue);
      if (nextValue.has(taskId)) {
        nextValue.delete(taskId);
      } else {
        nextValue.add(taskId);
      }
      return nextValue;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTaskIds.size === selectableTasks.length) {
      setSelectedTaskIds(new Set());
      return;
    }

    setSelectedTaskIds(new Set(selectableTasks.map((task) => task.id)));
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    const success = await updateTaskStatus(taskId, status);

    if (success) {
      toast.success(statusCopy[status].success);
      setSelectedTaskIds((currentValue) => {
        if (!currentValue.has(taskId)) return currentValue;
        const nextValue = new Set(currentValue);
        if (status === 'resolvida') nextValue.delete(taskId);
        return nextValue;
      });
      return;
    }

    toast.error(statusCopy[status].error);
  };

  const handleDeleteTask = async (taskId: string) => {
    const success = await deleteTask(taskId);

    if (success) {
      toast.success('Tarefa excluida.');
      setSelectedTaskIds((currentValue) => {
        if (!currentValue.has(taskId)) return currentValue;
        const nextValue = new Set(currentValue);
        nextValue.delete(taskId);
        return nextValue;
      });
      return;
    }

    toast.error('Nao foi possivel excluir a tarefa.');
  };

  const handleBatchClose = async () => {
    if (selectedTaskIds.size === 0) return;

    setIsBatchClosing(true);

    let successCount = 0;
    for (const taskId of selectedTaskIds) {
      const ok = await updateTaskStatus(taskId, 'resolvida');
      if (ok) successCount += 1;
    }

    setIsBatchClosing(false);
    setSelectedTaskIds(new Set());

    if (successCount === selectedTaskIds.size) {
      toast.success(`${successCount} tarefa(s) concluidas.`);
      return;
    }

    if (successCount > 0) {
      toast.error(`${selectedTaskIds.size - successCount} tarefa(s) nao puderam ser concluidas.`);
      return;
    }

    toast.error('Nao foi possivel concluir as tarefas selecionadas.');
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Todo list</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Organize acompanhamentos manuais em lista, calendario ou kanban.
            O fluxo automatico foi retirado desta aba para manter o foco nas tarefas reais do dia a dia.
          </p>
        </div>

        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova tarefa
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por titulo, aluno ou curso..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="aberta">A fazer</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="resolvida">Concluidas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Curso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cursos</SelectItem>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.short_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {viewMode === 'list' && selectedTaskIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3 animate-fade-in">
          <span className="text-sm font-medium">
            {selectedTaskIds.size} selecionada(s)
          </span>
          <Button size="sm" onClick={handleBatchClose} disabled={isBatchClosing}>
            {isBatchClosing ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="mr-1 h-4 w-4" />
            )}
            Concluir selecionadas
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedTaskIds(new Set())}>
            Limpar selecao
          </Button>
        </div>
      )}

      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5">
            <List className="h-4 w-4" />
            Lista
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Calendario
          </TabsTrigger>
          <TabsTrigger value="kanban" className="gap-1.5">
            <SquareKanban className="h-4 w-4" />
            Kanban
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-3">
          {selectableTasks.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={selectedTaskIds.size === selectableTasks.length && selectedTaskIds.size > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-xs text-muted-foreground">Selecionar todas as abertas</span>
            </div>
          )}

          {filteredTasks.map((task) => {
            const overdue = isTaskOverdue(task.due_date, task.status);

            return (
              <Card
                key={task.id}
                className={cn(
                  'shadow-sm transition-shadow hover:shadow-md',
                  overdue && 'border-l-2 border-l-destructive',
                  selectedTaskIds.has(task.id) && 'ring-2 ring-primary',
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {task.status !== 'resolvida' && (
                      <Checkbox
                        checked={selectedTaskIds.has(task.id)}
                        onCheckedChange={() => toggleTaskSelection(task.id)}
                        className="mt-1"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{task.title}</p>
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
                          {task.student && (
                            <Link
                              to={`/alunos/${task.student_id}`}
                              className="text-primary hover:underline"
                            >
                              {task.student.full_name}
                            </Link>
                          )}
                          {task.student && task.course && <span>|</span>}
                          {task.course && <span>{task.course.short_name}</span>}
                        </div>
                      )}

                      {task.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {stripHtml(task.description)}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <StatusBadge status={task.status} size="sm" />
                        <PriorityBadge priority={task.priority} size="sm" />
                        {task.due_date && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-xs',
                              overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
                            )}
                          >
                            <Clock className="h-3 w-3" />
                            {formatDueDate(task.due_date)}
                            {overdue && ' (atrasada)'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {task.status === 'aberta' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Iniciar tarefa"
                          onClick={() => void handleStatusChange(task.id, 'em_andamento')}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}

                      {task.status === 'em_andamento' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Concluir tarefa"
                          onClick={() => void handleStatusChange(task.id, 'resolvida')}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}

                      {task.status === 'resolvida' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Reabrir tarefa"
                          onClick={() => void handleStatusChange(task.id, 'aberta')}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}

                      {task.student_id && (
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/alunos/${task.student_id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Excluir tarefa"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir tarefa</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acao remove a tarefa da lista e nao pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => void handleDeleteTask(task.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredTasks.length === 0 && (
            <Card className="border-dashed shadow-none">
              <CardContent className="py-12 text-center">
                <ClipboardList className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="text-lg font-medium">Nenhuma tarefa encontrada</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {searchQuery || statusFilter !== 'all' || courseFilter !== 'all'
                    ? 'Ajuste os filtros para encontrar outras tarefas.'
                    : 'Crie a primeira tarefa manual desta lista.'}
                </p>
                {!searchQuery && statusFilter === 'all' && courseFilter === 'all' && (
                  <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar tarefa
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <TaskCalendarView tasks={filteredTasks} />
        </TabsContent>

        <TabsContent value="kanban">
          <TaskKanbanView tasks={filteredTasks} onStatusChange={handleStatusChange} />
        </TabsContent>
      </Tabs>

      <NewPendingTaskDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={refetch}
      />
    </div>
  );
}
