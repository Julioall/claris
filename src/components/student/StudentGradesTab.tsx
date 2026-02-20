import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, GraduationCap, Loader2 } from 'lucide-react';
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

  const fetchGrades = async () => {
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
          .order('activity_name'),
      ]);

      if (gradesResponse.error) throw gradesResponse.error;
      if (activitiesResponse.error) throw activitiesResponse.error;

      const formattedGrades: CourseGrade[] = (gradesResponse.data || []).map(grade => ({
        id: grade.id,
        course_id: grade.course_id,
        course_name: (grade.courses as any).name,
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
  };

  useEffect(() => {
    fetchGrades();
  }, [studentId]);

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
    return (activitiesByCourse[courseId] || []).filter((activity) => !activity.hidden);
  };

  const getVisibleCourseTotal = (courseId: string) => {
    const gradedVisibleActivities = getVisibleActivities(courseId).filter(
      (activity) => activity.grade !== null && activity.grade_max !== null && activity.grade_max > 0,
    );

    if (gradedVisibleActivities.length === 0) {
      return null;
    }

    const totalRaw = gradedVisibleActivities.reduce((sum, activity) => sum + (activity.grade || 0), 0);
    const totalMax = gradedVisibleActivities.reduce((sum, activity) => sum + (activity.grade_max || 0), 0);

    if (totalMax <= 0) {
      return null;
    }

    const normalized = (totalRaw / totalMax) * 100;
    return {
      gradeRaw: normalized,
      gradeMax: 100,
      gradePercentage: normalized,
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
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
          const visibleCourseTotal = getVisibleCourseTotal(grade.course_id);
          const displayedPercentage = visibleCourseTotal?.gradePercentage ?? null;
          const displayedGradeText = visibleCourseTotal
            ? `${visibleCourseTotal.gradeRaw.toFixed(1)} / ${visibleCourseTotal.gradeMax}`
            : null;

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
                      {displayedPercentage !== null ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xl font-bold ${getGradeColor(displayedPercentage)}`}>
                            {displayedPercentage.toFixed(1)}
                          </span>
                          {grade.letter_grade && visibleCourseTotal && (
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

                  {displayedPercentage !== null && (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{displayedGradeText}</span>
                        <span>
                          Nota total
                        </span>
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
