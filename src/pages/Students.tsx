import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Users, 
  Search, 
  Filter,
  ExternalLink,
  Clock,
  ClipboardList,
  Loader2,
  UserCheck
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { useStudentsData } from '@/hooks/useStudentsData';
import { useCoursesData } from '@/hooks/useCoursesData';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Enrollment status config
const enrollmentStatusConfig: Record<string, { label: string; className: string }> = {
  ativo: { label: 'Ativo', className: 'bg-status-success-bg text-status-success' },
  suspenso: { label: 'Suspenso', className: 'bg-status-warning-bg text-status-warning' },
  inativo: { label: 'Inativo', className: 'bg-muted text-muted-foreground' },
  concluido: { label: 'Concluído', className: 'bg-primary/10 text-primary' },
};

function EnrollmentStatusBadge({ status }: { status: string }) {
  const config = enrollmentStatusConfig[status?.toLowerCase()] || { 
    label: status || 'Ativo', 
    className: 'bg-muted text-muted-foreground' 
  };
  
  return (
    <span className={`inline-flex items-center rounded text-xs px-2 py-1 font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

export default function Students() {
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const { students, isLoading, error } = useStudentsData(
    courseFilter !== 'all' ? courseFilter : undefined
  );
  const { courses } = useCoursesData();

  const filteredStudents = students.filter(student => {
    const matchesSearch = student.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRisk = riskFilter === 'all' || student.current_risk_level === riskFilter;
    
    const matchesStatus = statusFilter === 'all' || 
      (student.enrollment_status?.toLowerCase() || 'ativo') === statusFilter;
    
    return matchesSearch && matchesRisk && matchesStatus;
  });

  const formatLastAccess = (date: string | undefined) => {
    if (!date) return 'Nunca';
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  };

  const formatLastAction = (date: string | undefined) => {
    if (!date) return '-';
    return format(new Date(date), "dd/MM", { locale: ptBR });
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
          <h1 className="text-2xl font-bold tracking-tight">Alunos</h1>
          <p className="text-muted-foreground">
            {students.length} alunos em seus cursos
          </p>
        </div>

      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome ou e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Risco" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="critico">Crítico</SelectItem>
              <SelectItem value="risco">Risco</SelectItem>
              <SelectItem value="atencao">Atenção</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <UserCheck className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="suspenso">Suspenso</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
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
                  {course.short_name || course.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Aluno</TableHead>
              <TableHead>Risco</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden md:table-cell">Pendências</TableHead>
              <TableHead className="hidden lg:table-cell">Último Acesso</TableHead>
              <TableHead className="hidden lg:table-cell">Última Ação</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.map((student) => (
              <TableRow key={student.id} className="group">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary shrink-0">
                      {student.full_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{student.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {student.email}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <RiskBadge level={student.current_risk_level} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <EnrollmentStatusBadge status={student.enrollment_status || 'ativo'} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {student.pending_tasks_count && student.pending_tasks_count > 0 ? (
                    <div className="flex items-center gap-1.5 text-sm">
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                      <span>{student.pending_tasks_count}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{formatLastAccess(student.last_access)}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="text-sm text-muted-foreground">
                    {formatLastAction(student.last_action_date)}
                  </span>
                </TableCell>
                <TableCell>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    asChild
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Link to={`/alunos/${student.id}`}>
                      Ver
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredStudents.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Nenhum aluno encontrado</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {searchQuery || riskFilter !== 'all' 
                ? 'Tente ajustar os filtros de busca'
                : 'Use o botão de sincronização na barra superior para carregar seus alunos'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
