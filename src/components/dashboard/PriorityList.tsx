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
import { Student } from '@/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PriorityListProps {
  criticalStudents: Student[];
}

export function PriorityList({ criticalStudents }: PriorityListProps) {
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

            {criticalStudents.length === 0 && (
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
