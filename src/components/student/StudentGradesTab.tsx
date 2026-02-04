import { useEffect, useState } from 'react';
import { GraduationCap, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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

interface StudentGradesTabProps {
  studentId: string;
}

export function StudentGradesTab({ studentId }: StudentGradesTabProps) {
  const [grades, setGrades] = useState<CourseGrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchGrades = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
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
        .eq('student_id', studentId);

      if (error) throw error;

      const formattedGrades: CourseGrade[] = (data || []).map(grade => ({
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

      setGrades(formattedGrades);
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

  const getProgressColor = (percentage: number | null): string => {
    if (percentage === null) return 'bg-muted';
    if (percentage >= 70) return 'bg-status-success';
    if (percentage >= 60) return 'bg-risk-atencao';
    if (percentage >= 40) return 'bg-risk-risco';
    return 'bg-risk-critico';
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
        {grades.map(grade => (
          <Card key={grade.id} className="card-interactive">
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
                    {grade.grade_percentage !== null ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xl font-bold ${getGradeColor(grade.grade_percentage)}`}>
                          {grade.grade_percentage.toFixed(1)}%
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

                {grade.grade_percentage !== null && (
                  <div className="space-y-1">
                    <Progress 
                      value={grade.grade_percentage} 
                      className="h-2"
                      indicatorClassName={getProgressColor(grade.grade_percentage)}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {grade.grade_formatted || `${grade.grade_raw?.toFixed(1) || '0'} / ${grade.grade_max || 100}`}
                      </span>
                      <span>Nota Total do Curso</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
