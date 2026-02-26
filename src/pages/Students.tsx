import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Search, 
  Filter,
  Clock,
  ClipboardList,
  Loader2,
  UserCheck,
  RefreshCw
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

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
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isUpdatingRisk, setIsUpdatingRisk] = useState(false);
  
  const { students, isLoading, error, refetch } = useStudentsData(
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

  const handleUpdateRisk = async () => {
    if (students.length === 0 || isUpdatingRisk) return;

    setIsUpdatingRisk(true);
    try {
      const uniqueStudentIds = Array.from(new Set(students.map(student => student.id)));
      const scopedCourseIds = courseFilter !== 'all'
        ? [courseFilter]
        : Array.from(new Set(courses.map(course => course.id)));

      const isMissingRpcError = (error: { code?: string | null; message?: string } | null) =>
        Boolean(error) && (
          error?.code === 'PGRST202' ||
          error?.message?.toLowerCase().includes('could not find the function') === true
        );

      const runCourseUpdate = async () => {
        if (scopedCourseIds.length === 0) {
          return { failedCount: 0, successCount: 0, updatedCount: 0, missingRpc: false };
        }

        const firstCourseId = scopedCourseIds[0];
        const probeCourse = await supabase.rpc('update_course_students_risk', { p_course_id: firstCourseId });
        if (isMissingRpcError(probeCourse.error)) {
          return { failedCount: 0, successCount: 0, updatedCount: 0, missingRpc: true };
        }

        if (probeCourse.error) {
          return { failedCount: 1, successCount: 0, updatedCount: 0, missingRpc: false };
        }

        if (scopedCourseIds.length === 1) {
          return {
            failedCount: 0,
            successCount: 1,
            updatedCount: probeCourse.data ?? 0,
            missingRpc: false,
          };
        }

        const results = await Promise.all(
          scopedCourseIds.slice(1).map(courseId =>
            supabase.rpc('update_course_students_risk', { p_course_id: courseId })
          )
        );

        const errors = results
          .map(result => result.error)
          .filter((error): error is NonNullable<typeof error> => Boolean(error));
        const failedCount = errors.length;
        const successCount = scopedCourseIds.length - failedCount;
        const updatedCount = (probeCourse.data ?? 0) + results.reduce((acc, result) => acc + (result.data ?? 0), 0);

        return {
          failedCount,
          successCount,
          updatedCount,
          missingRpc: errors.some(isMissingRpcError),
        };
      };

      const runStudentUpdate = async () => {
        const firstStudentId = uniqueStudentIds[0];
        const probeStudent = await supabase.rpc('update_student_risk', { p_student_id: firstStudentId });
        if (isMissingRpcError(probeStudent.error)) {
          return { failedCount: 0, successCount: 0, updatedCount: 0, missingRpc: true };
        }

        if (probeStudent.error) {
          return { failedCount: 1, successCount: 0, updatedCount: 0, missingRpc: false };
        }

        if (uniqueStudentIds.length === 1) {
          return {
            failedCount: 0,
            successCount: 1,
            updatedCount: 1,
            missingRpc: false,
          };
        }

        const results = await Promise.all(
          uniqueStudentIds.slice(1).map(studentId =>
            supabase.rpc('update_student_risk', { p_student_id: studentId })
          )
        );

        const errors = results
          .map(result => result.error)
          .filter((error): error is NonNullable<typeof error> => Boolean(error));
        const failedCount = errors.length;
        const successCount = uniqueStudentIds.length - failedCount;

        return {
          failedCount,
          successCount,
          updatedCount: successCount,
          missingRpc: errors.some(isMissingRpcError),
        };
      };

      let updateResult = await runCourseUpdate();
      let usedFallback = false;

      if (updateResult.missingRpc) {
        updateResult = await runStudentUpdate();
        usedFallback = true;
      }

      if (updateResult.missingRpc) {
        toast({
          title: 'Funcao de risco indisponivel',
          description: 'As funcoes de atualizacao de risco nao existem no banco local. Crie/aplique as migracoes.',
          variant: 'destructive',
        });
        return;
      }

      if (updateResult.failedCount > 0) {
        toast({
          title: 'Atualizacao parcial de risco',
          description: `${updateResult.updatedCount} atualizados e ${updateResult.failedCount} com erro.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Risco atualizado',
          description: usedFallback
            ? `${updateResult.updatedCount} alunos recalculados via fallback por aluno.`
            : `${updateResult.updatedCount} alunos recalculados com sucesso.`,
        });
      }

      await refetch();
    } catch (err) {
      console.error('Error updating student risk:', err);
      toast({
        title: 'Erro ao atualizar risco',
        description: 'Nao foi possivel recalcular o risco dos alunos.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingRisk(false);
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
          <h1 className="text-2xl font-bold tracking-tight">Alunos</h1>
          <p className="text-muted-foreground">
            {students.length} alunos em seus cursos
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleUpdateRisk}
          disabled={isLoading || isUpdatingRisk || students.length === 0}
        >
          {isUpdatingRisk ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Atualizando risco...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar risco
            </>
          )}
        </Button>
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
              <SelectItem value="inativo">Inativo</SelectItem>
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
