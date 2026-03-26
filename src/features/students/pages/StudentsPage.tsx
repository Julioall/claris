import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Clock,
  Filter,
  RefreshCw,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { useCoursesData } from '@/features/courses/hooks/useCoursesData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RiskBadge } from '@/components/ui/RiskBadge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { EnrollmentStatusBadge } from '../components/EnrollmentStatusBadge';
import { useStudentsData } from '../hooks/useStudentsData';
import { useSyncStudentsMutation } from '../hooks/useSyncStudentsMutation';

function formatLastAccess(date: string | null | undefined) {
  if (!date) return 'Nunca';
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
}

export default function StudentsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { isSyncing, isOfflineMode } = useAuth();
  const syncStudentsMutation = useSyncStudentsMutation();
  const { students, isLoading, error } = useStudentsData(
    courseFilter !== 'all' ? courseFilter : undefined,
  );
  const { courses } = useCoursesData();

  const targetCourseIds = courseFilter !== 'all'
    ? [courseFilter]
    : courses.map((course) => course.id);

  const handleSyncStudents = async () => {
    if (targetCourseIds.length === 0 || isOfflineMode) return;
    await syncStudentsMutation.mutateAsync(targetCourseIds);
  };

  const filteredStudents = students.filter((student) => {
    const matchesSearch = student.full_name.toLowerCase().includes(searchQuery.toLowerCase())
      || student.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRisk = riskFilter === 'all' || student.current_risk_level === riskFilter;
    const matchesStatus = statusFilter === 'all'
      || (student.enrollment_status?.toLowerCase() || 'ativo') === statusFilter;

    return matchesSearch && matchesRisk && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alunos</h1>
          <p className="text-muted-foreground">{students.length} alunos em seus cursos</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncStudents}
          disabled={isOfflineMode || isSyncing || syncStudentsMutation.isPending || targetCourseIds.length === 0}
          className="gap-2 self-start md:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${(isSyncing || syncStudentsMutation.isPending) ? 'animate-spin' : ''}`} />
          Sincronizar alunos
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome ou e-mail..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Risco" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="critico">Crítico</SelectItem>
              <SelectItem value="risco">Risco</SelectItem>
              <SelectItem value="atencao">Atenção</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <UserCheck className="mr-2 h-4 w-4" />
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
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.short_name || course.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Aluno</TableHead>
              <TableHead>Risco</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Último Acesso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.map((student) => (
              <TableRow
                key={student.id}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/alunos/${student.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/alunos/${student.id}`);
                  }
                }}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {student.full_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{student.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{student.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <RiskBadge level={student.current_risk_level} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <EnrollmentStatusBadge status={student.enrollment_status} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{formatLastAccess(student.last_access)}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredStudents.length === 0 && !isLoading && (
          <div className="py-12 text-center">
            <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Nenhum aluno encontrado</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {searchQuery || riskFilter !== 'all'
                ? 'Tente ajustar os filtros de busca'
                : 'Use o botão "Sincronizar alunos" desta tela para carregar seus alunos'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
