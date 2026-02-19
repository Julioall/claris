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
  Repeat,
  Zap,
  ListChecks
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { NewRecurringTaskDialog } from '@/components/pending-tasks/NewRecurringTaskDialog';
import { AddTaskActionDialog } from '@/components/pending-tasks/AddTaskActionDialog';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export default function PendingTasks() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const [selectedTaskForAction, setSelectedTaskForAction] = useState<string | null>(null);
  const [isGeneratingAuto, setIsGeneratingAuto] = useState(false);

  const { tasks, courses, isLoading, markAsResolved, deleteTask, refetch } = usePendingTasksData();

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.student?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (!task.student && task.course?.short_name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesCourse = courseFilter === 'all' || task.course_id === courseFilter;
    
    return matchesSearch && matchesStatus && matchesCourse;
  });

  const handleGenerateAutomatedTasks = async () => {
    if (!user) return;
    
    setIsGeneratingAuto(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-automated-tasks', {
        body: { automation_types: null } // null means all types
      });

      if (error) throw error;

      const totalCreated = data?.results?.reduce((sum: number, r: any) => sum + r.tasks_created, 0) || 0;
      
      if (totalCreated > 0) {
        toast.success(`${totalCreated} pendências automáticas criadas com sucesso!`);
        refetch();
      } else {
        toast.info('Nenhuma nova pendência automática foi criada');
      }
    } catch (error) {
      console.error('Error generating automated tasks:', error);
      toast.error('Erro ao gerar pendências automáticas');
    } finally {
      setIsGeneratingAuto(false);
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

    return (
      <Badge variant={badge.variant} className="text-xs">
        {badge.label}
      </Badge>
    );
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
    if (success) {
      toast.success('Pendência marcada como resolvida!');
    } else {
      toast.error('Erro ao resolver pendência');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const success = await deleteTask(taskId);
    if (success) {
      toast.success('Pendência excluída com sucesso!');
    } else {
      toast.error('Erro ao excluir pendência');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pendências</h1>
          <p className="text-muted-foreground">
            {filteredTasks.filter(t => t.status !== 'resolvida').length} pendências abertas
          </p>
        </div>

        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Criar Pendência
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Tipo de Pendência</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsDialogOpen(true)}>
                <ClipboardList className="h-4 w-4 mr-2" />
                Pendência Manual
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsRecurringDialogOpen(true)}>
                <Repeat className="h-4 w-4 mr-2" />
                Pendência Recorrente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button 
            onClick={handleGenerateAutomatedTasks}
            disabled={isGeneratingAuto}
            variant="secondary"
          >
            {isGeneratingAuto ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Gerar Automáticas
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por título ou aluno..."
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

      {/* Tasks list */}
      <div className="space-y-3">
        {filteredTasks.map((task) => (
          <Card 
            key={task.id} 
            className={cn(
              "card-interactive",
              isOverdue(task.due_date, task.status) && "border-l-2 border-l-risk-critico"
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{task.title}</p>
                    <Badge variant="outline" className="text-xs">
                      {task.task_type === 'moodle' ? 'Moodle' : 'Interna'}
                    </Badge>
                    {getAutomationTypeBadge(task.automation_type)}
                    {task.is_recurring && (
                      <Badge variant="secondary" className="text-xs">
                        <Repeat className="h-3 w-3 mr-1" />
                        Recorrente
                      </Badge>
                    )}
                  </div>
                  
                  {task.student ? (
                    <Link 
                      to={`/alunos/${task.student_id}`}
                      className="text-sm text-primary hover:underline mt-1 inline-block"
                    >
                      {task.student.full_name}
                    </Link>
                  ) : task.course && (
                    <div className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">Turma:</span> {task.course.short_name}
                    </div>
                  )}
                  
                  {task.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-3 mt-3">
                    <StatusBadge status={task.status} size="sm" />
                    <PriorityBadge priority={task.priority} size="sm" />
                    {task.due_date && (
                      <span className={cn(
                        "text-xs flex items-center gap-1",
                        isOverdue(task.due_date, task.status) ? "text-risk-critico font-medium" : "text-muted-foreground"
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
                        title="Excluir pendência"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir pendência</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja excluir esta pendência? Esta ação não pode ser desfeita.
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
      </div>

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

      <NewPendingTaskDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        onSuccess={refetch}
      />

      <NewRecurringTaskDialog 
        open={isRecurringDialogOpen} 
        onOpenChange={setIsRecurringDialogOpen}
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
