import { useState, useMemo } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Filter,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTasksData } from '@/hooks/useTasksData';
import type { InternalTaskStatus, InternalTaskPriority } from '@/types';

const STATUS_LABELS: Record<InternalTaskStatus, string> = {
  backlog: 'Backlog',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const STATUS_COLORS: Record<InternalTaskStatus, string> = {
  backlog: 'bg-muted text-muted-foreground',
  em_andamento: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  concluida: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelada: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const PRIORITY_LABELS: Record<InternalTaskPriority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

const PRIORITY_COLORS: Record<InternalTaskPriority, string> = {
  baixa: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  media: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  alta: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  urgente: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function formatDueDate(date?: string) {
  if (!date) return null;
  const d = new Date(date);
  if (isToday(d)) return 'Hoje';
  return format(d, "dd 'de' MMM", { locale: ptBR });
}

function isOverdue(date: string | undefined, status: InternalTaskStatus) {
  if (!date || status === 'concluida' || status === 'cancelada') return false;
  return isPast(new Date(date));
}

interface NewTaskForm {
  title: string;
  description: string;
  priority: InternalTaskPriority;
  category: string;
  due_date: string;
}

const DEFAULT_FORM: NewTaskForm = {
  title: '',
  description: '',
  priority: 'media',
  category: '',
  due_date: '',
};

export default function Tasks() {
  const { tasks, isLoading, createTask, updateTaskStatus, deleteTask, refetch } = useTasksData();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<NewTaskForm>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q || task.title.toLowerCase().includes(q) || task.description?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  }), [tasks, searchQuery, statusFilter, priorityFilter]);

  const handleStatusChange = async (taskId: string, status: InternalTaskStatus) => {
    const ok = await updateTaskStatus(taskId, status);
    if (ok) {
      toast.success(STATUS_LABELS[status] === 'Concluída' ? 'Tarefa concluída.' : `Status atualizado para ${STATUS_LABELS[status]}.`);
    } else {
      toast.error('Não foi possível atualizar o status da tarefa.');
    }
  };

  const handleDelete = async (taskId: string) => {
    const ok = await deleteTask(taskId);
    if (ok) {
      toast.success('Tarefa excluída.');
    } else {
      toast.error('Não foi possível excluir a tarefa.');
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error('O título é obrigatório.');
      return;
    }

    setIsSaving(true);
    const ok = await createTask({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      priority: form.priority,
      category: form.category.trim() || undefined,
      due_date: form.due_date || undefined,
    });
    setIsSaving(false);

    if (ok) {
      toast.success('Tarefa criada com sucesso.');
      setForm(DEFAULT_FORM);
      setIsDialogOpen(false);
      refetch();
    } else {
      toast.error('Não foi possível criar a tarefa.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Tarefas</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Centralize atividades internas, responsáveis, prazos e acompanhe o progresso operacional da equipe.
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova tarefa
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por título ou descrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
              {(Object.keys(STATUS_LABELS) as InternalTaskStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              {(Object.keys(PRIORITY_LABELS) as InternalTaskPriority[]).map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {filteredTasks.map((task) => {
          const overdue = isOverdue(task.due_date, task.status);
          return (
            <Card
              key={task.id}
              className={cn(
                'shadow-sm transition-shadow hover:shadow-md',
                overdue && 'border-l-2 border-l-destructive',
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{task.title}</p>
                      {task.category && (
                        <Badge variant="outline" className="text-xs">{task.category}</Badge>
                      )}
                    </div>

                    {task.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[task.status])}>
                        {STATUS_LABELS[task.status]}
                      </span>
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', PRIORITY_COLORS[task.priority])}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                      {task.due_date && (
                        <span className={cn('inline-flex items-center gap-1 text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                          <Clock className="h-3 w-3" />
                          {formatDueDate(task.due_date)}
                          {overdue && ' (atrasada)'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    {task.status === 'backlog' && (
                      <Button size="sm" variant="ghost" title="Iniciar tarefa" onClick={() => void handleStatusChange(task.id, 'em_andamento')}>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                    {task.status === 'em_andamento' && (
                      <Button size="sm" variant="ghost" title="Concluir tarefa" onClick={() => void handleStatusChange(task.id, 'concluida')}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    {task.status === 'concluida' && (
                      <Button size="sm" variant="ghost" title="Reabrir tarefa" onClick={() => void handleStatusChange(task.id, 'backlog')}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    {task.status === 'em_andamento' && (
                      <Button size="sm" variant="ghost" title="Cancelar tarefa" onClick={() => void handleStatusChange(task.id, 'cancelada')}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" title="Excluir tarefa" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir tarefa</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação remove a tarefa permanentemente e não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => void handleDelete(task.id)}
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
              <ClipboardCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium">Nenhuma tarefa encontrada</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
                  ? 'Ajuste os filtros para encontrar outras tarefas.'
                  : 'Crie a primeira tarefa interna da equipe.'}
              </p>
              {!searchQuery && statusFilter === 'all' && priorityFilter === 'all' && (
                <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar tarefa
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* New Task Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Título <span className="text-destructive">*</span></Label>
              <Input
                id="task-title"
                placeholder="Descreva a tarefa..."
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-description">Descrição</Label>
              <Textarea
                id="task-description"
                placeholder="Detalhes adicionais..."
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-priority">Prioridade</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as InternalTaskPriority }))}>
                  <SelectTrigger id="task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_LABELS) as InternalTaskPriority[]).map((p) => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="task-due">Prazo</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-category">Categoria</Label>
              <Input
                id="task-category"
                placeholder="Ex: Marketing, TI, Pedagógico..."
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); setForm(DEFAULT_FORM); }}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={isSaving}>
              {isSaving && <Spinner className="mr-2 h-4 w-4" onAccent />}
              Criar tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
