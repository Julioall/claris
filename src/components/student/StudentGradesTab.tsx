import { useState } from 'react';
import { ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type {
  StudentActivityWorkflowStatus,
  StudentCourseActivity,
  StudentCourseGrade,
  StudentProfileCourse,
} from '@/features/students/types';

interface StudentGradesTabProps {
  courses: StudentProfileCourse[];
}

function formatLastSync(date: string | null) {
  if (!date) return 'Nunca';
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
}

function formatDate(date: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('pt-BR');
}

function getGradeColor(percentage: number | null): string {
  if (percentage === null) return 'text-muted-foreground';
  if (percentage >= 70) return 'text-status-success';
  if (percentage >= 60) return 'text-risk-atencao';
  if (percentage >= 40) return 'text-risk-risco';
  return 'text-risk-critico';
}

function formatActivityGrade(activity: StudentCourseActivity): string {
  if (activity.grade !== null && activity.gradeMaximum !== null) {
    return `${activity.grade.toFixed(1)} / ${activity.gradeMaximum}`;
  }
  if (activity.grade !== null) return activity.grade.toFixed(1);
  return 'Sem nota';
}

function formatCourseGrade(grade: StudentCourseGrade): string | null {
  if (grade.formatted) return grade.formatted;
  if (grade.raw !== null && grade.maximum !== null) {
    return `${Number(grade.raw).toFixed(1)} / ${grade.maximum}`;
  }
  if (grade.raw !== null) return Number(grade.raw).toFixed(1);
  return null;
}

function formatActivityStatusLabel(status: StudentActivityWorkflowStatus) {
  if (status === 'corrected') return 'Corrigido';
  if (status === 'pendingCorrection') return 'Pendente de Correcao';
  if (status === 'pendingSubmission') return 'Pendente de Envio';
  return 'Concluido';
}

function getActivityStatusBadgeClassName(status: StudentActivityWorkflowStatus) {
  if (status === 'corrected') {
    return 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400';
  }
  if (status === 'pendingCorrection') {
    return 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400';
  }
  if (status === 'completed') {
    return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  }
  return '';
}

export function StudentGradesTab({ courses }: StudentGradesTabProps) {
  const [openCourses, setOpenCourses] = useState<Record<string, boolean>>({});

  if (courses.length === 0) {
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
        {courses.map((course) => {
          const displayedPercentage = course.grade?.percentage != null
            ? `${Number(course.grade.percentage).toFixed(1)}%`
            : null;
          const displayedGradeText = course.grade ? formatCourseGrade(course.grade) : null;

          return (
            <Card key={course.id} className="card-interactive">
              <Collapsible
                open={Boolean(openCourses[course.id])}
                onOpenChange={(isOpen) => {
                  setOpenCourses((current) => ({ ...current, [course.id]: isOpen }));
                }}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={course.name}>
                          {course.name}
                        </p>
                        {course.grade?.synchronizedAt ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Sincronizado {formatLastSync(course.grade.synchronizedAt)}
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
                            <span className={`text-xl font-bold ${getGradeColor(course.grade?.percentage ?? null)}`}>
                              {displayedGradeText}
                            </span>
                            {course.grade?.letter && (
                              <Badge variant="outline" className="text-xs">{course.grade.letter}</Badge>
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
                          {openCourses[course.id]
                            ? <ChevronUp className="h-4 w-4 shrink-0" />
                            : <ChevronDown className="h-4 w-4 shrink-0" />}
                        </span>
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="mt-3 space-y-2 border-t pt-3">
                        {course.activities.length > 0 ? course.activities.map((activity) => {
                          const dueDateLabel = formatDate(activity.dueAt);
                          return (
                            <div
                              key={activity.id}
                              className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium" title={activity.name}>
                                  {activity.name}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                  {activity.type && <span>{activity.type}</span>}
                                  {dueDateLabel && <span>Prazo: {dueDateLabel}</span>}
                                  {activity.hidden && <span>Oculta das metricas</span>}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {activity.workflowStatus === 'corrected' && (
                                  <span className="shrink-0 text-sm font-medium text-foreground">
                                    {formatActivityGrade(activity)}
                                  </span>
                                )}
                                <Badge
                                  variant={activity.workflowStatus === 'pendingSubmission' ? 'secondary' : undefined}
                                  className={getActivityStatusBadgeClassName(activity.workflowStatus)}
                                >
                                  {formatActivityStatusLabel(activity.workflowStatus)}
                                </Badge>
                              </div>
                            </div>
                          );
                        }) : (
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
