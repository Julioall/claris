import { Link } from 'react-router-dom';
import {
  ClipboardCheck,
  Clock3,
  ExternalLink,
  GraduationCap,
} from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RiskBadge } from '@/components/ui/RiskBadge';
import type { DashboardReviewActivity } from '@/types';

interface ActivitiesToReviewProps {
  activities: DashboardReviewActivity[];
}

function formatShortDate(date?: string) {
  if (!date) return null;
  return format(new Date(date), "dd 'de' MMM", { locale: ptBR });
}

function formatWaitingTime(date?: string) {
  if (!date) return 'Aguardando correção';
  return `Enviada ${formatDistanceToNowStrict(new Date(date), {
    addSuffix: true,
    locale: ptBR,
  })}`;
}

export function ActivitiesToReview({ activities }: ActivitiesToReviewProps) {
  const visibleActivities = activities.slice(0, 6);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-status-warning" />
            Atividades para corrigir
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {activities.length} na fila
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px] px-6 pb-6">
          <div className="space-y-3">
            {visibleActivities.map((activity) => {
              const courseLabel = activity.course.short_name || activity.course.name;
              const dueDateLabel = formatShortDate(activity.due_date);

              return (
                <div
                  key={activity.id}
                  className="rounded-lg border border-status-warning/25 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-sm font-medium truncate">{activity.activity_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {activity.student.full_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/80">
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap className="h-3 w-3" />
                          {courseLabel}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {formatWaitingTime(activity.submitted_at)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <RiskBadge level={activity.student.current_risk_level} size="sm" />
                        {dueDateLabel && (
                          <span className="text-xs text-muted-foreground">
                            Prazo: {dueDateLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/alunos/${activity.student_id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}

            {activities.length === 0 && (
              <div className="py-6 text-center text-muted-foreground">
                <ClipboardCheck className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">Nenhuma atividade aguardando correção</p>
                <p className="mt-1 text-xs">
                  As entregas enviadas e ainda sem nota aparecerão aqui.
                </p>
              </div>
            )}

            {activities.length > visibleActivities.length && (
              <p className="text-xs text-muted-foreground">
                Mostrando as 6 atividades mais antigas da fila.
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}