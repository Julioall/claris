import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  ClipboardList, 
  Search, 
  Filter,
  Plus,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Trash2,
  Zap,
  ListChecks,
  CalendarDays,
  List,
  BookTemplate,
  CheckCheck,
  Users,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePendingTasksData } from '@/hooks/usePendingTasksData';
import { NewPendingTaskDialog } from '@/components/pending-tasks/NewPendingTaskDialog';
import { GenerateAutomatedTasksDialog } from '@/components/pending-tasks/GenerateAutomatedTasksDialog';
import { AddTaskActionDialog } from '@/components/pending-tasks/AddTaskActionDialog';
import { TaskCalendarView } from '@/components/pending-tasks/TaskCalendarView';
import { TaskTemplatesDialog } from '@/components/pending-tasks/TaskTemplatesDialog';
import { BatchGenerateDialog } from '@/components/pending-tasks/BatchGenerateDialog';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export default function PendingTasks() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAutoDialogOpen, setIsAutoDialogOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [selectedTaskForAction, setSelectedTaskForAction] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [isBatchClosing, setIsBatchClosing] = useState(false);

  const { tasks, courses, isLoading, markAsResolved, deleteTask, refetch } = usePendingTasksData();

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.student?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.course?.short_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesCourse = courseFilter === 'all' || task.course_id === courseFilter;
    
    return matchesSearch && matchesStatus && matchesCourse;
  });

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTaskIds.size === filteredTasks.filter(t => t.status !== 'resolvida').length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredTasks.filter(t => t.status !== 'resolvida').map(t => t.id)));
    }
  };

  const handleBatchClose = async () => {
    if (selectedTaskIds.size === 0) return;
    setIsBatchClosing(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('pending_tasks')
        .update({ status: 'resolvida' as any, completed_at: now })
        .in('id', Array.from(selectedTaskIds));

      if (error) throw error;
      toast.success(`${selectedTaskIds.size} pendências resolvidas!`);
      setSelectedTaskIds(new Set());
      refetch();
    } catch (err) {
      console.error('Error batch closing:', err);
      toast.error('Erro ao fechar pendências em lote');
    } finally {
      setIsBatchClosing(false);
    }
  };

  const getAutomationTypeBadge = (automationType?: string) => {
    if (!automationType || automationType === 'manual') return null;
    
    const badges: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      auto_at_risk: { label: 'Auto: Em Risco', variant: 'default' },
      auto_missed_assignment: { label: 'Auto: Não Entregue', variant: 'secondary' },
      auto_uncorrected_activity: { label: 'Auto: Não Corrigida', variant: 'outline' },
      recurring: { label: 'Recorrente', variant: 'default' },
    };

    const badge = badges[automationType];
    if (!badge) return null;

    return <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>;
  };

  const formatDueDate = (date: string | undefined) => {
    if (!date) return null;
    const d = new Date(date);
    if (isToday(d)) return 'Hoje';
    return format(d, "dd 'de' MMM", { locale: ptBR });
  };

  const isOverdue = (date: string | undefined, status: string) => {
    if (!date || status === 'resolvida') return false;
    return isPast(new Date(date));
  };

  const handleMarkAsResolved = async (taskId: string) => {
    const success = await markAsResolved(taskId);
    if (success) toast.success('Pendência resolvida!');
    else toast.error('Erro ao resolver pendência');
  };

  const handleDeleteTask = async (taskId: string) => {
    const success = await deleteTask(taskId);
    if (success) toast.success('Pendência excluída!');
    else toast.error('Erro ao excluir pendência');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const openCount = filteredTasks.filter(t => t.status !== 'resolvida').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pendências</h1>
          <p className="text-muted-foreground">
            {openCount} pendência{openCount !== 1 ? 's' : ''} aberta{openCount !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">
                <Zap className="h-4 w-4 mr-2" />
                Automação
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsAutoDialogOpen(true)}>
                <Zap className="h-4 w-4 mr-2" />
                Gerar Automáticas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsBatchOpen(true)}>
                <Users className="h-4 w-4 mr-2" />
                Gerar em Lote (Modelo)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsTemplatesOpen(true)}>
                <BookTemplate className="h-4 w-4 mr-2" />
                Gerenciar Modelos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por título, aluno ou curso..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="aberta">Aberta</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="resolvida">Resolvida</SelectItem>
            </SelectContent>
          </Select>

          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Curso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cursos</SelectItem>
              {courses.map(course => (
                <SelectItem key={course.id} value={course.id}>
                  {course.short_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Batch actions bar */}
      {selectedTaskIds.size > 0 && (
        <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3 animate-fade-in">
          <span className="text-sm font-medium">
            {selectedTaskIds.size} selecionada{selectedTaskIds.size > 1 ? 's' : ''}
          </span>
          <Button 
            size="sm" 
            onClick={handleBatchClose}
            disabled={isBatchClosing}
          >
            {isBatchClosing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4 mr-1" />
            )}
            Fechar Selecionadas
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedTaskIds(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      {/* Tabs: Lista / Calendário */}
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5">
            <List className="h-4 w-4" />
            Lista
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Calendário
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-3">
          {/* Select all */}
          {filteredTasks.filter(t => t.status !== 'resolvida').length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={selectedTaskIds.size === filteredTasks.filter(t => t.status !== 'resolvida').length && selectedTaskIds.size > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-xs text-muted-foreground">Selecionar todas</span>
            </div>
          )}

          {filteredTasks.map((task) => (
            <Card 
              key={task.id} 
              className={cn(
                "card-interactive",
                isOverdue(task.due_date, task.status) && "border-l-2 border-l-destructive",
                selectedTaskIds.has(task.id) && "ring-2 ring-primary"
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{task.title}</p>
                      <Badge variant="outline" className="text-xs">
                        {task.task_type === 'moodle' ? 'Moodle' : 'Interna'}
                      </Badge>
                      {getAutomationTypeBadge(task.automation_type)}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      {task.student && (
                        <Link 
                          to={`/alunos/${task.student_id}`}
                          className="text-primary hover:underline"
                        >
                          {task.student.full_name}
                        </Link>
                      )}
                      {task.student && task.course && <span>·</span>}
                      {task.course && <span>{task.course.short_name}</span>}
                    </div>
                    
                    {task.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {task.description.replace(/<[^>]*>/g, '')}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-3 mt-2">
                      <StatusBadge status={task.status} size="sm" />
                      <PriorityBadge priority={task.priority} size="sm" />
                      {task.due_date && (
                        <span className={cn(
                          "text-xs flex items-center gap-1",
                          isOverdue(task.due_date, task.status) ? "text-destructive font-medium" : "text-muted-foreground"
                        )}>
                          <Clock className="h-3 w-3" />
                          {formatDueDate(task.due_date)}
                          {isOverdue(task.due_date, task.status) && " (atrasado)"}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 shrink-0">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      title="Adicionar ação"
                      onClick={() => setSelectedTaskForAction(task.id)}
                    >
                      <ListChecks className="h-4 w-4" />
                    </Button>
                    {task.status !== 'resolvida' && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        title="Marcar como resolvida"
                        onClick={() => handleMarkAsResolved(task.id)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
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
                          title="Excluir"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir pendência</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza? Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteTask(task.id)}
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
          ))}

          {filteredTasks.length === 0 && (
            <div className="text-center py-12">
              <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Nenhuma pendência encontrada</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {searchQuery || statusFilter !== 'all' || courseFilter !== 'all'
                  ? 'Tente ajustar os filtros'
                  : 'Todas as pendências foram resolvidas!'
                }
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <TaskCalendarView 
            tasks={filteredTasks} 
            onTaskClick={(taskId) => setSelectedTaskForAction(taskId)}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <NewPendingTaskDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        onSuccess={refetch}
      />

      <GenerateAutomatedTasksDialog
        open={isAutoDialogOpen}
        onOpenChange={setIsAutoDialogOpen}
        onSuccess={refetch}
      />

      <TaskTemplatesDialog
        open={isTemplatesOpen}
        onOpenChange={setIsTemplatesOpen}
      />

      <BatchGenerateDialog
        open={isBatchOpen}
        onOpenChange={setIsBatchOpen}
        onSuccess={refetch}
      />

      {selectedTaskForAction && (
        <AddTaskActionDialog 
          open={!!selectedTaskForAction} 
          onOpenChange={(open) => !open && setSelectedTaskForAction(null)}
          pendingTaskId={selectedTaskForAction}
          onSuccess={refetch}
        />
      )}
    </div>
  );
}
