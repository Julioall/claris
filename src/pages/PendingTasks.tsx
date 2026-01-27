import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  ClipboardList, 
  Search, 
  Filter,
  Plus,
  CheckCircle2,
  Clock,
  ExternalLink
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
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { mockPendingTasks, mockCourses } from '@/lib/mock-data';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function PendingTasks() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');

  const filteredTasks = mockPendingTasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.student?.full_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesCourse = courseFilter === 'all' || task.course_id === courseFilter;
    
    return matchesSearch && matchesStatus && matchesCourse;
  });

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

        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nova pendência
        </Button>
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
              {mockCourses.map(course => (
                <SelectItem key={course.id} value={course.id}>
                  {course.short_name || course.name}
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
                  </div>
                  
                  {task.student && (
                    <Link 
                      to={`/alunos/${task.student_id}`}
                      className="text-sm text-primary hover:underline mt-1 inline-block"
                    >
                      {task.student.full_name}
                    </Link>
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
                  {task.status !== 'resolvida' && (
                    <Button size="sm" variant="ghost" title="Marcar como resolvida">
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/alunos/${task.student_id}`}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
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
    </div>
  );
}
