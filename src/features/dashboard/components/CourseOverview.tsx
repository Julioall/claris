import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, Clock, ExternalLink, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Course } from '@/features/courses/types';
import { getCourseLifecycleStatus } from '@/lib/course-dates';

interface CourseOverviewProps {
  courses: Course[];
}

export function CourseOverview({ courses }: CourseOverviewProps) {
  const ongoingCourses = courses.filter((course) => getCourseLifecycleStatus(course) === 'em_andamento');

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
                className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3 card-interactive"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{course.name}</p>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
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
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70">
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
              <div className="py-6 text-center text-muted-foreground">
                <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">Nenhum curso encontrado</p>
                <p className="mt-1 text-xs">Sincronize com o Moodle para carregar seus cursos</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
