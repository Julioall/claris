import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  GraduationCap,
  RefreshCw,
  Users,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { CourseAttendanceTab } from '@/components/attendance/CourseAttendanceTab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MoodleIcon } from '@/components/ui/MoodleIcon';
import { Progress } from '@/components/ui/progress';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { getCourseEffectiveEndDate } from '@/lib/course-dates';
import { getStudentActivityWorkflowStatus } from '@/lib/student-activity-status';
import { cn } from '@/lib/utils';

import { AssignmentSuggestionPanel } from '../components/AssignmentSuggestionPanel';
import { useCoursePanel } from '../hooks/useCoursePanel';

export default function CoursePanelPage() {
  const { id } = useParams<{ id: string }>();
  const {
    course,
    students,
    activities,
    activitySubmissions = [],
    stats,
    isLoading,
    error,
    refetch,
    toggleActivityVisibility,
    isAttendanceEnabled,
    isLoadingAttendanceFlag,
    toggleAttendance,
  } = useCoursePanel(id);
  const { isEditMode, syncCourseIncremental, isSyncing, isOfflineMode } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedActivities, setExpandedActivities] = useState<Record<string, boolean>>({});
  const [isSyncingSection, setIsSyncingSection] = useState<'students' | 'activities' | null>(null);
  const [studentsPage, setStudentsPage] = useState(1);
  const [activitiesPage, setActivitiesPage] = useState(1);

  const studentsPageSize = 25;
  const activitiesPageSize = 12;

  const activeStudentIds = new Set(students.map((student) => student.id));
  const studentsById = new Map(students.map((student) => [student.id, student]));
  const visibleActivities = isEditMode
    ? activities
    : activities.filter((activity) => !activity.hidden);

  const studentsTotalPages = Math.max(1, Math.ceil(students.length / studentsPageSize));
  const activitiesTotalPages = Math.max(1, Math.ceil(visibleActivities.length / activitiesPageSize));

  const studentsPageSafe = Math.min(studentsPage, studentsTotalPages);
  const activitiesPageSafe = Math.min(activitiesPage, activitiesTotalPages);

  const paginatedStudents = students.slice(
    (studentsPageSafe - 1) * studentsPageSize,
    studentsPageSafe * studentsPageSize,
  );
  const paginatedActivities = visibleActivities.slice(
    (activitiesPageSafe - 1) * activitiesPageSize,
    activitiesPageSafe * activitiesPageSize,
  );

  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR });
  };

  const formatDateTime = (date: string | null | undefined) => {
    if (!date) return '-';
    return format(new Date(date), "dd/MM 'às' HH:mm", { locale: ptBR });
  };

  const toggleActivityExpansion = (moodleActivityId: string) => {
    setExpandedActivities((current) => ({
      ...current,
      [moodleActivityId]: !current[moodleActivityId],
    }));
  };

  const handleSyncStudentsTab = async () => {
    if (!id || isOfflineMode) return;

    setIsSyncingSection('students');
    try {
      await syncCourseIncremental(id, ['students']);
      await refetch();
    } finally {
      setIsSyncingSection(null);
    }
  };

  const handleSyncActivitiesTab = async () => {
    if (!id || isOfflineMode) return;

    setIsSyncingSection('activities');
    try {
      await syncCourseIncremental(id, ['activities', 'grades']);
      await refetch();
    } finally {
      setIsSyncingSection(null);
    }
  };

  useEffect(() => {
    setExpandedActivities({});
  }, [course?.id]);

  useEffect(() => {
    setStudentsPage(1);
  }, [course?.id]);

  useEffect(() => {
    setActivitiesPage(1);
  }, [course?.id, isEditMode]);

  useEffect(() => {
    if (studentsPage > studentsTotalPages) {
      setStudentsPage(studentsTotalPages);
    }
  }, [studentsPage, studentsTotalPages]);

  useEffect(() => {
    if (activitiesPage > activitiesTotalPages) {
      setActivitiesPage(activitiesTotalPages);
    }
  }, [activitiesPage, activitiesTotalPages]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link to="/meus-cursos">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar aos cursos
          </Link>
        </Button>
        <div className="flex h-64 flex-col items-center justify-center">
          <XCircle className="mb-4 h-12 w-12 text-destructive" />
          <h2 className="text-lg font-medium">Curso não encontrado</h2>
          <p className="text-sm text-muted-foreground">{error || 'O curso solicitado não existe.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
              <Link to="/meus-cursos">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="line-clamp-1 text-2xl font-bold tracking-tight">{course.name}</h1>
              {course.category && (
                <p className="text-sm text-muted-foreground">{course.category}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="mr-2 hidden text-right text-xs text-muted-foreground md:block">
            <span>Última sincronização:</span>
            <span className="ml-1 font-medium">{formatDateTime(course.last_sync)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalStudents}</p>
                <p className="text-xs text-muted-foreground">Alunos matriculados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-risk-risco/10 p-2">
                <AlertTriangle className="h-5 w-5 text-risk-risco" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.atRiskStudents}</p>
                <p className="text-xs text-muted-foreground">Alunos em risco</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalActivities}</p>
                <p className="text-xs text-muted-foreground">Atividades sincronizadas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.completionRate}%</p>
                <p className="text-xs text-muted-foreground">Taxa de conclusão</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="students">Alunos ({stats.totalStudents})</TabsTrigger>
            <TabsTrigger value="activities">Atividades ({stats.totalActivities})</TabsTrigger>
            {isAttendanceEnabled && (
              <TabsTrigger value="attendance">Presenças</TabsTrigger>
            )}
          </TabsList>

          <div className="flex items-center gap-2">
            {activeTab === 'students' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncStudentsTab}
                disabled={isOfflineMode || isSyncing || isSyncingSection !== null}
                className="gap-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${(isSyncing || isSyncingSection === 'students') ? 'animate-spin' : ''}`}
                />
                Sincronizar alunos da UC
              </Button>
            )}

            {activeTab === 'activities' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncActivitiesTab}
                disabled={isOfflineMode || isSyncing || isSyncingSection !== null}
                className="gap-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${(isSyncing || isSyncingSection === 'activities') ? 'animate-spin' : ''}`}
                />
                Sincronizar atividades e notas
              </Button>
            )}

            {!isLoadingAttendanceFlag && (
              <>
                <Switch
                  checked={isAttendanceEnabled}
                  onCheckedChange={() => { void toggleAttendance(); }}
                  id="attendance-toggle"
                />
                <label
                  htmlFor="attendance-toggle"
                  className="cursor-pointer text-sm text-muted-foreground"
                >
                  Controle de presença
                </label>
              </>
            )}
          </div>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações do Curso</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Início:</span>
                  <span className="font-medium">{formatDate(course.start_date)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Término:</span>
                  <span className="font-medium">{formatDate(getCourseEffectiveEndDate(course))}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Última sincronização:</span>
                  <span className="font-medium">{formatDateTime(course.last_sync)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MoodleIcon className="h-4 w-4" />
                  <span className="text-muted-foreground">ID Moodle:</span>
                  <span className="font-medium">{course.moodle_course_id}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição de Risco</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { level: 'normal', label: 'Normal', count: stats.riskDistribution.normal },
                  { level: 'atencao', label: 'Atenção', count: stats.riskDistribution.atencao },
                  { level: 'risco', label: 'Risco', count: stats.riskDistribution.risco },
                  { level: 'critico', label: 'Crítico', count: stats.riskDistribution.critico },
                ].map((item) => {
                  const percentage = stats.totalStudents > 0
                    ? Math.round((item.count / stats.totalStudents) * 100)
                    : 0;

                  return (
                    <div key={item.level} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{item.label}</span>
                        <span className="text-muted-foreground">
                          {item.count} alunos ({percentage}%)
                        </span>
                      </div>
                      <Progress
                        value={percentage}
                        className={cn(
                          'h-2',
                          item.level === 'normal' && '[&>div]:bg-risk-normal',
                          item.level === 'atencao' && '[&>div]:bg-risk-atencao',
                          item.level === 'risco' && '[&>div]:bg-risk-risco',
                          item.level === 'critico' && '[&>div]:bg-risk-critico',
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {students.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
                  <h3 className="text-lg font-medium">Nenhum aluno encontrado</h3>
                  <p className="text-sm text-muted-foreground">
                    Use o botão "Sincronizar alunos da UC" nesta aba para carregar os alunos.
                  </p>
                </div>
              ) : (
                <>
                  <div className="divide-y">
                    {paginatedStudents.map((student) => (
                      <Link
                        key={student.id}
                        to={`/alunos/${student.id}`}
                        className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            {student.avatar_url ? (
                              <img src={student.avatar_url} alt="" className="h-10 w-10 rounded-full" />
                            ) : (
                              <GraduationCap className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{student.full_name}</p>
                            {student.email && (
                              <p className="text-xs text-muted-foreground">{student.email}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <RiskBadge level={student.current_risk_level || 'normal'} />
                          {student.last_access && (
                            <span className="hidden text-xs text-muted-foreground md:block">
                              Último acesso: {formatDateTime(student.last_access)}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
                    <span>
                      Exibindo {(studentsPageSafe - 1) * studentsPageSize + 1}-
                      {Math.min(studentsPageSafe * studentsPageSize, students.length)} de {students.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setStudentsPage((current) => Math.max(1, current - 1))}
                        disabled={studentsPageSafe <= 1}
                      >
                        Anterior
                      </Button>
                      <span>
                        Página {studentsPageSafe} de {studentsTotalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setStudentsPage((current) => Math.min(studentsTotalPages, current + 1))}
                        disabled={studentsPageSafe >= studentsTotalPages}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activities" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {visibleActivities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/50" />
                    <h3 className="text-lg font-medium">Nenhuma atividade encontrada</h3>
                    <p className="text-sm text-muted-foreground">
                      Use o botão "Sincronizar atividades e notas" nesta aba para carregar as atividades.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="divide-y">
                      {paginatedActivities.map((activity) => {
                        const isAssignment = activity.activity_type === 'assign' || activity.activity_type === 'assignment';
                        const activitySubmissionsForAssign = isAssignment
                          ? activitySubmissions
                            .filter((submission) =>
                              submission.moodle_activity_id === activity.moodle_activity_id
                              && activeStudentIds.has(submission.student_id),
                            )
                            .sort((left, right) => {
                              const studentA = studentsById.get(left.student_id)?.full_name || '';
                              const studentB = studentsById.get(right.student_id)?.full_name || '';
                              return studentA.localeCompare(studentB, 'pt-BR');
                            })
                          : [];
                        const pendingSubmissionCount = activitySubmissionsForAssign.filter(
                          (submission) => getStudentActivityWorkflowStatus(submission) === 'pending_submission',
                        ).length;
                        const pendingCorrectionCount = activitySubmissionsForAssign.filter(
                          (submission) => getStudentActivityWorkflowStatus(submission) === 'pending_correction',
                        ).length;
                        const isExpanded = Boolean(expandedActivities[activity.moodle_activity_id]);

                        return (
                          <div
                            key={activity.id}
                            className={cn(
                              'p-4 transition-opacity',
                              activity.hidden && 'bg-muted/30 opacity-50',
                            )}
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  <p
                                    className={cn(
                                      'font-medium',
                                      activity.hidden && 'line-through text-muted-foreground',
                                    )}
                                  >
                                    {activity.activity_name}
                                  </p>
                                  {activity.hidden && (
                                    <Badge variant="secondary" className="text-xs">
                                      <EyeOff className="mr-1 h-3 w-3" />
                                      Oculta
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {activity.activity_type && (
                                    <Badge variant="outline" className="text-xs">
                                      {activity.activity_type}
                                    </Badge>
                                  )}
                                  {activity.due_date && (
                                    <span>Prazo: {formatDate(activity.due_date)}</span>
                                  )}
                                </div>
                                {isAssignment && (
                                  <div className="text-xs text-muted-foreground">
                                    <span>Entregas: {activitySubmissionsForAssign.length}</span>
                                    <span className="mx-2">•</span>
                                    <span>Pendente de Envio: {pendingSubmissionCount}</span>
                                    <span className="mx-2">•</span>
                                    <span>Pendente de Correção: {pendingCorrectionCount}</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-3">
                                {isEditMode && (
                                  <div className="flex items-center gap-4">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="flex items-center gap-2">
                                            <Switch
                                              checked={!activity.hidden}
                                              onCheckedChange={(checked) => {
                                                void toggleActivityVisibility(activity.moodle_activity_id, !checked);
                                              }}
                                            />
                                            {activity.hidden ? (
                                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                              <Eye className="h-4 w-4 text-primary" />
                                            )}
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>
                                            {activity.hidden
                                              ? 'Exibir atividade nas métricas'
                                              : 'Ocultar atividade das métricas'}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                )}

                              </div>
                            </div>

                              {isAssignment && (
                                <AssignmentSuggestionPanel
                                  activity={activity}
                                  submissions={activitySubmissionsForAssign}
                                  studentsById={studentsById}
                                  isExpanded={isExpanded}
                                  onToggleExpand={() => toggleActivityExpansion(activity.moodle_activity_id)}
                                  onApproved={refetch}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
                      <span>
                        Exibindo {(activitiesPageSafe - 1) * activitiesPageSize + 1}-
                        {Math.min(activitiesPageSafe * activitiesPageSize, visibleActivities.length)} de {visibleActivities.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setActivitiesPage((current) => Math.max(1, current - 1))}
                          disabled={activitiesPageSafe <= 1}
                        >
                          Anterior
                        </Button>
                        <span>
                          Página {activitiesPageSafe} de {activitiesTotalPages}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setActivitiesPage((current) => Math.min(activitiesTotalPages, current + 1))}
                          disabled={activitiesPageSafe >= activitiesTotalPages}
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        {isAttendanceEnabled && (
          <TabsContent value="attendance" className="mt-4">
            <CourseAttendanceTab courseId={course.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
