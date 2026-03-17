import { useState, useMemo } from 'react';
import { CheckSquare, Plus, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskForm } from '@/components/tasks/TaskForm';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { useTasks } from '@/hooks/useTasks';
import type { Task, TaskStatus, TaskPriority } from '@/types';

type StatusFilter = 'all' | TaskStatus;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'todo', label: 'A fazer' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluído' },
];

export default function Tarefas() {
  const { tasks, isLoading, createTask, updateTask, deleteTask, isCreating, isUpdating } = useTasks();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter]);

  const counts = useMemo(() => ({
    all: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  }), [tasks]);

  const openCreate = () => { setEditingTask(null); setFormOpen(true); };
  const openEdit = (task: Task) => { setEditingTask(task); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditingTask(null); };

  const handleFormSubmit = (values: { title: string; description?: string; status: TaskStatus; priority: TaskPriority; due_date?: string }) => {
    if (editingTask) {
      updateTask({ id: editingTask.id, input: values }, { onSuccess: closeForm });
    } else {
      createTask(values, { onSuccess: closeForm });
    }
  };

  const handleStatusChange = (id: string, status: TaskStatus) => {
    updateTask({ id, input: { status } });
  };

  const handleDelete = () => {
    if (deleteId) deleteTask(deleteId, { onSuccess: () => setDeleteId(null) });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CheckSquare className="h-6 w-6 text-primary" />
            Tarefas
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Organize e acompanhe suas tarefas operacionais.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Nova tarefa
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            {STATUS_TABS.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs">
                {tab.label}
                {counts[tab.value] > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">{counts[tab.value]}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select value={priorityFilter} onValueChange={v => setPriorityFilter(v as 'all' | TaskPriority)}>
          <SelectTrigger className="w-40 h-9 text-xs">
            <ListFilter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas prioridades</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <CheckSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {statusFilter === 'all' && priorityFilter === 'all'
              ? 'Nenhuma tarefa criada ainda'
              : 'Nenhuma tarefa encontrada com esses filtros'}
          </p>
          {statusFilter === 'all' && priorityFilter === 'all' && (
            <Button variant="outline" size="sm" onClick={openCreate} className="mt-4">
              <Plus className="h-4 w-4 mr-1.5" />
              Criar primeira tarefa
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={openEdit}
              onDelete={id => setDeleteId(id)}
              onStatusChange={handleStatusChange}
              onClick={setDetailTask}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={open => { if (!open) closeForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
            <DialogDescription>
              {editingTask ? 'Atualize as informações da tarefa.' : 'Preencha os dados para criar uma nova tarefa.'}
            </DialogDescription>
          </DialogHeader>
          <TaskForm
            defaultValues={editingTask ?? undefined}
            onSubmit={handleFormSubmit}
            onCancel={closeForm}
            isLoading={isCreating || isUpdating}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
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

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={detailTask}
        open={!!detailTask}
        onClose={() => setDetailTask(null)}
      />
    </div>
  );
}
