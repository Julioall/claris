import { Link } from 'react-router-dom';
import { BookOpen, Users, AlertTriangle, ExternalLink, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Course } from '@/features/courses/types';
import { getCourseLifecycleStatus } from '@/lib/course-dates';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CourseOverviewProps {
  courses: Course[];
}

export function CourseOverview({ courses }: CourseOverviewProps) {
  const ongoingCourses = courses.filter(course => getCourseLifecycleStatus(course) === 'em_andamento');

  const formatLastSync = (date: string | undefined) => {
    if (!date) return 'Nunca';
    return format(new Date(date), "dd/MM 'às' HH:mm", { locale: ptBR });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Visão por Curso
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px] px-6 pb-6">
          <div className="space-y-3">
          {ongoingCourses.map((course) => (
            <div 
              key={course.id}
              className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/30 border card-interactive"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{course.name}</p>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {course.students_count || 0} alunos
                  </span>
                  {course.at_risk_count && course.at_risk_count > 0 && (
                    <span className="flex items-center gap-1 text-risk-risco">
                      <AlertTriangle className="h-3 w-3" />
                      {course.at_risk_count} em risco
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/70">
                  <Clock className="h-3 w-3" />
                  Sincronizado: {formatLastSync(course.last_sync)}
                </div>
              </div>
              <Button size="sm" variant="ghost" asChild>
                <Link to={`/cursos/${course.id}`}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ))}

          {ongoingCourses.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum curso encontrado</p>
              <p className="text-xs mt-1">Sincronize com o Moodle para carregar seus cursos</p>
            </div>
          )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
