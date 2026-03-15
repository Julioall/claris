import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
}

interface StudentActivityGrade {
  id: string;
  course_id: string;
  activity_name: string;
  activity_type: string | null;
  grade: number | null;
  grade_max: number | null;
  percentage: number | null;
  status: string | null;
  due_date: string | null;
  hidden: boolean;
}

interface StudentGradesTabProps {
  studentId: string;
}

export function StudentGradesTab({ studentId }: StudentGradesTabProps) {
  const [grades, setGrades] = useState<CourseGrade[]>([]);
  const [activitiesByCourse, setActivitiesByCourse] = useState<Record<string, StudentActivityGrade[]>>({});
  const [openCourses, setOpenCourses] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchGrades = useCallback(async () => {
    setIsLoading(true);
    try {
      const [gradesResponse, activitiesResponse] = await Promise.all([
        supabase
          .from('student_course_grades')
          .select(`
            id,
            course_id,
            grade_raw,
            grade_max,
            grade_percentage,
            grade_formatted,
            letter_grade,
            last_sync,
            courses!inner(name)
          `)
          .eq('student_id', studentId),
        supabase
          .from('student_activities')
          .select(`
            id,
            course_id,
            activity_name,
            activity_type,
            grade,
            grade_max,
            percentage,
            status,
            due_date,
            hidden
          `)
          .eq('student_id', studentId)
          .neq('activity_type', 'scorm')
          .order('activity_name'),
      ]);

      if (gradesResponse.error) throw gradesResponse.error;
      if (activitiesResponse.error) throw activitiesResponse.error;

      const formattedGrades: CourseGrade[] = (gradesResponse.data || []).map(grade => ({
        id: grade.id,
        course_id: grade.course_id,
        course_name: (grade.courses as { name: string }).name,
        grade_raw: grade.grade_raw,
        grade_max: grade.grade_max,
        grade_percentage: grade.grade_percentage,
        grade_formatted: grade.grade_formatted,
        letter_grade: grade.letter_grade,
        last_sync: grade.last_sync,
      }));

      const groupedActivities = (activitiesResponse.data || []).reduce<Record<string, StudentActivityGrade[]>>(
        (acc, activity) => {
          if (!acc[activity.course_id]) {
            acc[activity.course_id] = [];
          }
          acc[activity.course_id].push(activity);
          return acc;
        },
        {},
      );

      setGrades(formattedGrades);
      setActivitiesByCourse(groupedActivities);
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
    return 'Sem nota';
  };

  const getVisibleActivities = (courseId: string): StudentActivityGrade[] => {
    const courseActivities = activitiesByCourse[courseId] || [];
    const hasAnyGradebookData = courseActivities.some(
      (activity) => activity.grade_max !== null || activity.percentage !== null || activity.grade !== null,
    );

    if (!hasAnyGradebookData) {
      return courseActivities.filter((activity) => !activity.hidden);
    }

    return courseActivities.filter((activity) => (activity.grade_max ?? 0) > 0);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (grades.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Nenhuma nota encontrada</p>
        <p className="text-xs mt-1">As notas serão exibidas após a sincronização dos cursos</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Notas por Curso</h3>
      </div>

      <div className="grid gap-3">
        {grades.map(grade => {
          const visibleActivities = getVisibleActivities(grade.course_id);
          const displayedPercentage = grade.grade_percentage !== null
            ? `${Number(grade.grade_percentage).toFixed(1)}%`
            : null;
          const displayedGradeText = formatCourseGrade(grade);

          return (
          <Card key={grade.id} className="card-interactive">
            <Collapsible
              open={Boolean(openCourses[grade.course_id])}
              onOpenChange={(isOpen) => {
                setOpenCourses((current) => ({
                  ...current,
                  [grade.course_id]: isOpen,
                }));
              }}
            >
              <CardContent className="p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" title={grade.course_name}>
                        {grade.course_name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Sincronizado {formatLastSync(grade.last_sync)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {displayedGradeText !== null ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xl font-bold ${getGradeColor(grade.grade_percentage)}`}>
                            {displayedGradeText}
                          </span>
                          {grade.letter_grade && (
                            <Badge variant="outline" className="text-xs">
                              {grade.letter_grade}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sem nota</span>
                      )}
                    </div>
                  </div>

                  {displayedGradeText !== null && (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Livro de notas</span>
                        <span>{displayedPercentage || 'Nota total'}</span>
                      </div>
                    </div>
                  )}

                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="mt-1 w-full rounded-md border border-dashed px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span>Atividades e notas separadas</span>
                        {openCourses[grade.course_id] ? (
                          <ChevronUp className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        )}
                      </span>
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {visibleActivities.length > 0 ? (
                        visibleActivities.map((activity) => (
                          <div
                            key={activity.id}
                            className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium" title={activity.activity_name}>
                                {activity.activity_name}
                              </p>
                              {activity.activity_type && (
                                <p className="text-xs text-muted-foreground">{activity.activity_type}</p>
                              )}
                            </div>
                            <span className="shrink-0 text-sm font-medium text-foreground">
                              {formatActivityGrade(activity)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Nenhuma atividade visivel com nota encontrada para este curso.
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </CardContent>
            </Collapsible>
          </Card>
        )})}
      </div>
    </div>
  );
}
