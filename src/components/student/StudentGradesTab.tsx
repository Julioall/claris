import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Spinner } from '@/components/ui/spinner';
import { fetchStudentActivities, fetchStudentGrades } from '@/features/students/api';
import {
  getStudentActivityWorkflowStatus,
  isStudentActivityCorrected,
  isStudentActivityWeightedInGradebook,
  type StudentActivityWorkflowStatus,
} from '@/lib/student-activity-status';

interface CourseGrade {
  id: string;
  course_id: string;
  course_name: string;
  grade_raw: number | null;
  grade_max: number | null;
  grade_percentage: number | null;
  grade_formatted: string | null;
  letter_grade: string | null;
  last_sync: string | null;
  courses?: {
    name: string;
  } | null;
}

interface StudentActivityGrade {
  id: string;
  course_id: string;
  moodle_activity_id?: string | null;
  activity_name: string;
  activity_type: string | null;
  grade: number | null;
  grade_max: number | null;
  percentage: number | null;
  status: string | null;
  due_date: string | null;
  hidden: boolean;
  completed_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  courses?: {
    name: string;
  } | null;
}

interface CourseSection {
  courseId: string;
  courseName: string;
  grade: CourseGrade | null;
  activities: StudentActivityGrade[];
  visibleActivities: StudentActivityGrade[];
}

interface StudentGradesTabProps {
  studentId: string;
}

export function StudentGradesTab({ studentId }: StudentGradesTabProps) {
  const [grades, setGrades] = useState<CourseGrade[]>([]);
  const [activities, setActivities] = useState<StudentActivityGrade[]>([]);
  const [openCourses, setOpenCourses] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchGrades = useCallback(async () => {
    setIsLoading(true);
    try {
      const [gradesResponse, activitiesResponse] = await Promise.all([
        fetchStudentGrades(studentId),
        fetchStudentActivities(studentId),
      ]);

      if (gradesResponse.error) throw gradesResponse.error;
      if (activitiesResponse.error) throw activitiesResponse.error;

      const formattedGrades: CourseGrade[] = (gradesResponse.data || []).map((grade) => ({
        id: grade.id,
        course_id: grade.course_id,
        course_name: grade.courses?.name || 'Curso sem nome',
        grade_raw: grade.grade_raw,
        grade_max: grade.grade_max,
        grade_percentage: grade.grade_percentage,
        grade_formatted: grade.grade_formatted,
        letter_grade: grade.letter_grade,
        last_sync: grade.last_sync,
        courses: grade.courses,
      }));

      setGrades(formattedGrades);
      setActivities((activitiesResponse.data || []) as StudentActivityGrade[]);
    } catch (err) {
      console.error('Error fetching grades:', err);
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchGrades();
  }, [fetchGrades]);

  const formatLastSync = (date: string | null) => {
    if (!date) return 'Nunca';
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  };

  const formatDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const getGradeColor = (percentage: number | null): string => {
    if (percentage === null) return 'text-muted-foreground';
    if (percentage >= 70) return 'text-status-success';
    if (percentage >= 60) return 'text-risk-atencao';
    if (percentage >= 40) return 'text-risk-risco';
    return 'text-risk-critico';
  };

  const formatActivityGrade = (activity: StudentActivityGrade): string => {
    if (activity.grade !== null && activity.grade_max !== null) {
      return `${activity.grade.toFixed(1)} / ${activity.grade_max}`;
    }

    if (activity.grade !== null) {
      return activity.grade.toFixed(1);
    }

    return 'Sem nota';
  };

  const formatCourseGrade = (grade: CourseGrade): string | null => {
    if (grade.grade_formatted) return grade.grade_formatted;

    if (grade.grade_raw !== null && grade.grade_max !== null) {
      return `${Number(grade.grade_raw).toFixed(1)} / ${grade.grade_max}`;
    }

    if (grade.grade_raw !== null) {
      return Number(grade.grade_raw).toFixed(1);
    }

    return null;
  };

  const getVisibleActivities = (courseActivities: StudentActivityGrade[]) => {
    const workflowPriority: Record<StudentActivityWorkflowStatus, number> = {
      pending_correction: 0,
      pending_submission: 1,
      corrected: 2,
      completed: 3,
    };

    return courseActivities
      .filter((activity) => {
        if (!isStudentActivityWeightedInGradebook(activity)) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftWorkflow = getStudentActivityWorkflowStatus(left);
        const rightWorkflow = getStudentActivityWorkflowStatus(right);

        if (workflowPriority[leftWorkflow] !== workflowPriority[rightWorkflow]) {
          return workflowPriority[leftWorkflow] - workflowPriority[rightWorkflow];
        }

        const leftDueDate = left.due_date ? new Date(left.due_date).getTime() : Number.POSITIVE_INFINITY;
        const rightDueDate = right.due_date ? new Date(right.due_date).getTime() : Number.POSITIVE_INFINITY;

        if (leftDueDate !== rightDueDate) {
          return leftDueDate - rightDueDate;
        }

        return left.activity_name.localeCompare(right.activity_name, 'pt-BR');
      });
  };

  const formatActivityStatusLabel = (status: StudentActivityWorkflowStatus) => {
    if (status === 'corrected') return 'Corrigido';
    if (status === 'pending_correction') return 'Pendente de Correcao';
    if (status === 'pending_submission') return 'Pendente de Envio';
    return 'Concluido';
  };

  const getActivityStatusBadgeClassName = (status: StudentActivityWorkflowStatus) => {
    if (status === 'corrected') {
      return 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400';
    }

    if (status === 'pending_correction') {
      return 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400';
    }

    if (status === 'completed') {
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
    }

    return '';
  };

  const courseSectionsMap = new Map<string, Omit<CourseSection, 'visibleActivities'>>();

  grades.forEach((grade) => {
    courseSectionsMap.set(grade.course_id, {
      courseId: grade.course_id,
      courseName: grade.course_name,
      grade,
      activities: courseSectionsMap.get(grade.course_id)?.activities || [],
    });
  });

  activities.forEach((activity) => {
    const existing = courseSectionsMap.get(activity.course_id);
    const courseName = existing?.courseName || activity.courses?.name || 'Curso sem nome';

    courseSectionsMap.set(activity.course_id, {
      courseId: activity.course_id,
      courseName,
      grade: existing?.grade || null,
      activities: [...(existing?.activities || []), activity],
    });
  });

  const courseSections: CourseSection[] = Array.from(courseSectionsMap.values())
    .map((section) => ({
      ...section,
      visibleActivities: getVisibleActivities(section.activities),
    }))
    .filter((section) => section.grade !== null || section.visibleActivities.length > 0)
    .sort((left, right) => left.courseName.localeCompare(right.courseName, 'pt-BR'));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (courseSections.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Nenhuma nota encontrada</p>
        <p className="text-xs mt-1">As notas e atividades serao exibidas apos a sincronizacao dos cursos</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Notas por Curso</h3>
      </div>

      <div className="grid gap-3">
        {courseSections.map((section) => {
          const displayedPercentage = section.grade?.grade_percentage != null
            ? `${Number(section.grade.grade_percentage).toFixed(1)}%`
            : null;
          const displayedGradeText = section.grade ? formatCourseGrade(section.grade) : null;

          return (
            <Card key={section.courseId} className="card-interactive">
              <Collapsible
                open={Boolean(openCourses[section.courseId])}
                onOpenChange={(isOpen) => {
                  setOpenCourses((current) => ({
                    ...current,
                    [section.courseId]: isOpen,
                  }));
                }}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={section.courseName}>
                          {section.courseName}
                        </p>
                        {section.grade?.last_sync ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Sincronizado {formatLastSync(section.grade.last_sync)}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Sem nota total sincronizada
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {displayedGradeText !== null ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-xl font-bold ${getGradeColor(section.grade?.grade_percentage ?? null)}`}>
                              {displayedGradeText}
                            </span>
                            {section.grade?.letter_grade && (
                              <Badge variant="outline" className="text-xs">
                                {section.grade.letter_grade}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Sem nota total</span>
                        )}
                      </div>
                    </div>

                    {displayedGradeText !== null && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Livro de notas</span>
                        <span>{displayedPercentage || 'Nota total'}</span>
                      </div>
                    )}

                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="mt-1 w-full rounded-md border border-dashed px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span>Atividades e notas separadas</span>
                          {openCourses[section.courseId] ? (
                            <ChevronUp className="h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                          )}
                        </span>
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="mt-3 space-y-2 border-t pt-3">
                        {section.visibleActivities.length > 0 ? (
                          section.visibleActivities.map((activity) => {
                            const workflowStatus = getStudentActivityWorkflowStatus(activity);
                            const dueDateLabel = formatDate(activity.due_date);

                            return (
                              <div
                                key={activity.id}
                                className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium" title={activity.activity_name}>
                                    {activity.activity_name}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                    {activity.activity_type && <span>{activity.activity_type}</span>}
                                    {dueDateLabel && <span>Prazo: {dueDateLabel}</span>}
                                    {activity.hidden && <span>Oculta das metricas</span>}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  {isStudentActivityCorrected(activity) && (
                                    <span className="shrink-0 text-sm font-medium text-foreground">
                                      {formatActivityGrade(activity)}
                                    </span>
                                  )}
                                  <Badge
                                    variant={workflowStatus === 'pending_submission' ? 'secondary' : undefined}
                                    className={getActivityStatusBadgeClassName(workflowStatus)}
                                  >
                                    {formatActivityStatusLabel(workflowStatus)}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Nenhuma atividade relevante encontrada para este curso.
                          </p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </CardContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
