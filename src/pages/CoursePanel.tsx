import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  Users, 
  ClipboardList, 
  AlertTriangle,
  BookOpen,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  GraduationCap,
  Eye,
  EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCoursePanel } from '@/hooks/useCoursePanel';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CourseAttendanceTab } from '@/components/attendance/CourseAttendanceTab';

export default function CoursePanel() {
  const { id } = useParams<{ id: string }>();
  const { course, students, activities, stats, isLoading, error, toggleActivityVisibility } = useCoursePanel(id);
  const { user, isEditMode } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [isAttendanceEnabled, setIsAttendanceEnabled] = useState(false);
  const [isLoadingAttendanceFlag, setIsLoadingAttendanceFlag] = useState(true);

  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  };

  const formatDateTime = (date: string | null | undefined) => {
    if (!date) return '-';
    return format(new Date(date), "dd/MM 'às' HH:mm", { locale: ptBR });
  };

  useEffect(() => {
    const loadAttendanceFlag = async () => {
      if (!user || !id) {
        setIsAttendanceEnabled(false);
        setIsLoadingAttendanceFlag(false);
        return;
      }

      setIsLoadingAttendanceFlag(true);
      try {
        // attendance_course_settings table doesn't exist yet — default to disabled
        setIsAttendanceEnabled(false);
      } catch (err) {
        console.error('Error loading attendance flag:', err);
        setIsAttendanceEnabled(false);
      } finally {
        setIsLoadingAttendanceFlag(false);
      }
    };

    loadAttendanceFlag();
  }, [id, user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link to="/cursos">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar aos cursos
          </Link>
        </Button>
        <div className="flex flex-col items-center justify-center h-64">
          <XCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-lg font-medium">Curso não encontrado</h2>
          <p className="text-muted-foreground text-sm">{error || 'O curso solicitado não existe.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
              <Link to="/cursos">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight line-clamp-1">{course.name}</h1>
              {course.category && (
                <p className="text-sm text-muted-foreground">{course.category}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground text-right mr-2 hidden md:block">
            <span>Última sincronização:</span>
            <span className="font-medium ml-1">{formatDateTime(course.last_sync)}</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
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
              <div className="p-2 rounded-lg bg-risk-risco/10">
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
              <div className="p-2 rounded-lg bg-primary/10">
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
              <div className="p-2 rounded-lg bg-green-500/10">
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="students">Alunos ({stats.totalStudents})</TabsTrigger>
          <TabsTrigger value="activities">Atividades ({stats.totalActivities})</TabsTrigger>
          {!isLoadingAttendanceFlag && isAttendanceEnabled && (
            <TabsTrigger value="attendance">Presenças</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Course Info */}
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
                  <span className="font-medium">{formatDate(course.end_date)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Última sincronização:</span>
                  <span className="font-medium">{formatDateTime(course.last_sync)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
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
                        <span className="text-muted-foreground">{item.count} alunos ({percentage}%)</span>
                      </div>
                      <Progress 
                        value={percentage} 
                        className={cn(
                          "h-2",
                          item.level === 'normal' && "[&>div]:bg-risk-normal",
                          item.level === 'atencao' && "[&>div]:bg-risk-atencao",
                          item.level === 'risco' && "[&>div]:bg-risk-risco",
                          item.level === 'critico' && "[&>div]:bg-risk-critico",
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
                  <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">Nenhum aluno encontrado</h3>
                  <p className="text-muted-foreground text-sm">Use o botao de sincronizacao da barra superior para carregar os alunos.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {students.map((student) => (
                    <Link
                      key={student.id}
                      to={`/alunos/${student.id}`}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
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
                          <span className="text-xs text-muted-foreground hidden md:block">
                            Último acesso: {formatDateTime(student.last_access)}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activities" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">Nenhuma atividade encontrada</h3>
                  <p className="text-muted-foreground text-sm">Use o botao de sincronizacao da barra superior para carregar as atividades.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {activities.map((activity) => (
                    <div 
                      key={activity.id} 
                      className={cn(
                        "p-4 transition-opacity",
                        activity.hidden && "opacity-50 bg-muted/30"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={cn("font-medium", activity.hidden && "line-through text-muted-foreground")}>
                              {activity.activity_name}
                            </p>
                            {activity.hidden && (
                              <Badge variant="secondary" className="text-xs">
                                <EyeOff className="h-3 w-3 mr-1" />
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
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Edit mode: visibility toggle */}
                          {isEditMode && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={!activity.hidden}
                                      onCheckedChange={(checked) => 
                                        toggleActivityVisibility(activity.moodle_activity_id, !checked)
                                      }
                                    />
                                    {activity.hidden ? (
                                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <Eye className="h-4 w-4 text-primary" />
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{activity.hidden ? 'Exibir atividade nas métricas' : 'Ocultar atividade das métricas'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}

                          {/* Grade/Status display */}
                          <div className="text-right">
                            {activity.grade !== null && activity.grade_max !== null ? (
                              <div>
                                <span className="font-semibold">{activity.grade}</span>
                                <span className="text-muted-foreground">/{activity.grade_max}</span>
                              </div>
                            ) : (
                              <Badge variant={activity.status === 'completed' ? 'default' : 'secondary'}>
                                {activity.status === 'completed' ? 'Concluída' : 'Pendente'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {!isLoadingAttendanceFlag && isAttendanceEnabled && (
          <TabsContent value="attendance" className="mt-4">
            <CourseAttendanceTab courseId={course.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
