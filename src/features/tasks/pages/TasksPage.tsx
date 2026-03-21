import { useMemo, useState } from 'react';
import {
  CalendarRange,
  CheckSquare,
  LayoutDashboard,
  List,
  ListFilter,
  Plus,
  Sparkles,
  Tag as TagIcon,
} from 'lucide-react';

import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { TaskForm } from '@/components/tasks/TaskForm';
import { TaskKanbanBoard } from '@/components/tasks/TaskKanbanBoard';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { matchesTaskDateWindow, TASK_DATE_WINDOW_OPTIONS, type TaskDateWindow } from '@/lib/tasks';

import type { Task, TaskPriority, TaskStatus } from '../types';
import { useTasks } from '../hooks/useTasks';

type StatusFilter = 'all' | TaskStatus;
type ViewMode = 'list' | 'kanban';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'todo', label: 'A fazer' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluído' },
];

export default function TasksPage() {
  const { tasks, isLoading, createTask, updateTask, deleteTask, isCreating, isUpdating } = useTasks();
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [dateWindow, setDateWindow] = useState<TaskDateWindow>('day');
  const [tagSearch, setTagSearch] = useState('');
  const [aiOnly, setAiOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  const baseFiltered = useMemo(() => {
    const tagQuery = tagSearch.trim().toLowerCase();

    return tasks.filter((task) => {
      if (!matchesTaskDateWindow(task.due_date, dateWindow)) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
      if (aiOnly && !task.suggested_by_ai) return false;

      if (tagQuery) {
        const allTags = [
          ...(task.tags ?? []).map((tag) => tag.label.toLowerCase()),
          ...(task.ai_tags ?? []).map((tag) => tag.toLowerCase()),
        ];

        if (!allTags.some((tag) => tag.includes(tagQuery))) return false;
      }

      return true;
    });
  }, [tasks, dateWindow, priorityFilter, tagSearch, aiOnly]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return baseFiltered;
    return baseFiltered.filter((task) => task.status === statusFilter);
  }, [baseFiltered, statusFilter]);

  const counts = useMemo(() => ({
    all: baseFiltered.length,
    todo: baseFiltered.filter((task) => task.status === 'todo').length,
    in_progress: baseFiltered.filter((task) => task.status === 'in_progress').length,
    done: baseFiltered.filter((task) => task.status === 'done').length,
  }), [baseFiltered]);

  const aiTaskCount = useMemo(() => tasks.filter((task) => task.suggested_by_ai).length, [tasks]);
  const isKanban = viewMode === 'kanban';

  const openCreate = (status: TaskStatus = 'todo') => {
    setDefaultStatus(status);
    setEditingTask(null);
    setFormOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingTask(null);
  };

  const handleFormSubmit = (values: {
    title: string;
    description?: string;
    status: TaskStatus;
    priority: TaskPriority;
    due_date?: string;
  }) => {
    if (editingTask) {
      updateTask({ id: editingTask.id, input: values }, { onSuccess: closeForm });
      return;
    }

    createTask(values, { onSuccess: closeForm });
  };

  const handleStatusChange = (id: string, status: TaskStatus) => {
    const currentTask = tasks.find((task) => task.id === id);
    if (currentTask?.status === status) return;

    updateTask({ id, input: { status } });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteTask(deleteId, { onSuccess: () => setDeleteId(null) });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CheckSquare className="h-6 w-6 text-primary" />
            Tarefas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize e acompanhe suas tarefas operacionais.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              className="h-9 rounded-none px-3 text-xs"
              onClick={() => setViewMode('kanban')}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Kanban
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-9 rounded-none px-3 text-xs"
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </Button>
          </div>
          <Button onClick={() => openCreate()} className="shrink-0">
            <Plus className="mr-1.5 h-4 w-4" />
            Nova tarefa
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {!isKanban && (
          <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <TabsList>
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs">
                  {tab.label}
                  {counts[tab.value] > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                      {counts[tab.value]}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {isKanban && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{filtered.length} tarefa{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <TagIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filtrar por tag..."
              value={tagSearch}
              onChange={(event) => setTagSearch(event.target.value)}
              className="h-9 w-40 pl-8 text-xs"
            />
          </div>

          {aiTaskCount > 0 && (
            <Button
              variant={aiOnly ? 'default' : 'outline'}
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => setAiOnly((value) => !value)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Claris IA
              {aiOnly && (
                <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
                  {aiTaskCount}
                </Badge>
              )}
            </Button>
          )}

          <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as 'all' | TaskPriority)}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <ListFilter className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="low">Baixa</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="urgent">Urgente</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dateWindow} onValueChange={(value) => setDateWindow(value as TaskDateWindow)}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <CalendarRange className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {TASK_DATE_WINDOW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : isKanban ? (
        <TaskKanbanBoard
          tasks={filtered}
          isLoading={isLoading}
          onEdit={openEdit}
          onDelete={(id) => setDeleteId(id)}
          onStatusChange={handleStatusChange}
          onTaskClick={setDetailTask}
          onCreateInColumn={openCreate}
        />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <CheckSquare className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            {statusFilter === 'all' && priorityFilter === 'all' && dateWindow === 'day' && !tagSearch && !aiOnly
              ? 'Nenhuma tarefa prevista para hoje'
              : statusFilter === 'all' && priorityFilter === 'all' && dateWindow === 'all' && !tagSearch && !aiOnly
                ? 'Nenhuma tarefa criada ainda'
                : 'Nenhuma tarefa encontrada com esses filtros'}
          </p>
          {statusFilter === 'all' && priorityFilter === 'all' && dateWindow === 'all' && !tagSearch && !aiOnly && (
            <Button variant="outline" size="sm" onClick={() => openCreate()} className="mt-4">
              <Plus className="mr-1.5 h-4 w-4" />
              Criar primeira tarefa
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={openEdit}
              onDelete={(id) => setDeleteId(id)}
              onStatusChange={handleStatusChange}
              onClick={setDetailTask}
            />
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
            <DialogDescription>
              {editingTask ? 'Atualize as informações da tarefa.' : 'Preencha os dados para criar uma nova tarefa.'}
            </DialogDescription>
          </DialogHeader>
          <TaskForm
            defaultValues={editingTask ?? { status: defaultStatus }}
            onSubmit={handleFormSubmit}
            onCancel={closeForm}
            isLoading={isCreating || isUpdating}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A tarefa e seus dados serão permanentemente removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TaskDetailDrawer
        task={detailTask}
        open={!!detailTask}
        onClose={() => setDetailTask(null)}
      />
    </div>
  );
}
