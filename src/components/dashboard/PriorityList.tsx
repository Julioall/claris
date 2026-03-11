import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckSquare,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { PendingTask, Student } from '@/types';
import { format, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PriorityListProps {
  overdueTasks: PendingTask[];
  upcomingTasks: PendingTask[];
  criticalStudents: Student[];
}

export function PriorityList({ overdueTasks, upcomingTasks, criticalStudents }: PriorityListProps) {
  const formatDueDate = (date: string) => {
    const dueDate = new Date(date);
    if (isToday(dueDate)) return 'Hoje';
    return format(dueDate, "dd 'de' MMM", { locale: ptBR });
  };

  const formatLastSync = (date: string | undefined) => {
    if (!date) return null;
    return format(new Date(date), "dd/MM 'as' HH:mm", { locale: ptBR });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-risk-risco" />
          Prioridades - O que fazer agora
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px] px-6 pb-6">
          <div className="space-y-4">
            {overdueTasks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Atrasados
                </h4>
                {overdueTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-risk-critico-bg/50 border border-risk-critico/20"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.student && (
                        <p className="text-xs text-muted-foreground">
                          {task.student.full_name}
                        </p>
                      )}
                      {task.updated_at && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/70">
                          <Clock className="h-3 w-3" />
                          Sincronizado: {formatLastSync(task.updated_at)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.due_date && (
                        <span className="text-xs text-risk-critico font-medium">
                          {formatDueDate(task.due_date)}
                        </span>
                      )}
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/alunos/${task.student_id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {upcomingTasks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" />
                  Prazo Proximo
                </h4>
                {upcomingTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <PriorityBadge priority={task.priority} size="sm" />
                      </div>
                      {task.student && (
                        <p className="text-xs text-muted-foreground">
                          {task.student.full_name}
                        </p>
                      )}
                      {task.updated_at && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/70">
                          <Clock className="h-3 w-3" />
                          Sincronizado: {formatLastSync(task.updated_at)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.due_date && (
                        <span className="text-xs text-muted-foreground">
                          {formatDueDate(task.due_date)}
                        </span>
                      )}
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/alunos/${task.student_id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {criticalStudents.length > 0 && (
              <div className="space-y-2">
                {criticalStudents.slice(0, 3).map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border card-interactive"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary shrink-0">
                        {student.full_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{student.full_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <RiskBadge level={student.current_risk_level} size="sm" />
                          {student.pending_tasks_count && student.pending_tasks_count > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {student.pending_tasks_count} pendencias
                            </span>
                          )}
                        </div>
                        {student.updated_at && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/70">
                            <Clock className="h-3 w-3" />
                            Sincronizado: {formatLastSync(student.updated_at)}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/alunos/${student.id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {overdueTasks.length === 0 && upcomingTasks.length === 0 && criticalStudents.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma prioridade pendente!</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
