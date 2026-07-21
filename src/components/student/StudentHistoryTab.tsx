import { History, AlertTriangle, Clock, BookOpen, TrendingDown } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { RiskBadge } from '@/features/students/components/RiskBadge';
import { useStudentHistory } from '@/features/students/hooks/useStudentHistory';
import type { StudentHistorySnapshot } from '@/features/students/types';
import { cn } from '@/lib/utils';

const DROPOUT_THRESHOLD_DAYS = 90;
const RISK_LEVEL_ORDER = ['normal', 'atencao', 'risco', 'critico'] as const;

const enrollmentStatusLabel: Record<string, string> = {
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  concluido: 'Concluído',
  inativo: 'Inativo',
};

function riskChanged(prev: StudentHistorySnapshot | undefined, curr: StudentHistorySnapshot) {
  return Boolean(prev && prev.riskLevel !== curr.riskLevel);
}

function accessImproved(prev: StudentHistorySnapshot | undefined, curr: StudentHistorySnapshot) {
  if (!prev) return false;
  return (curr.daysSinceAccess ?? 9999) < (prev.daysSinceAccess ?? 9999);
}

function riskIndex(level: string): number {
  const index = RISK_LEVEL_ORDER.indexOf(level as typeof RISK_LEVEL_ORDER[number]);
  return index === -1 ? 0 : index;
}

function SnapshotCard({
  snapshot,
  prev,
  isLatest,
}: {
  snapshot: StudentHistorySnapshot;
  prev: StudentHistorySnapshot | undefined;
  isLatest: boolean;
}) {
  const isDropout = (snapshot.daysSinceAccess ?? 0) > DROPOUT_THRESHOLD_DAYS;
  const riskLevelChanged = riskChanged(prev, snapshot);
  const accessGot = accessImproved(prev, snapshot);
  const riskWorsened = prev && riskIndex(snapshot.riskLevel) > riskIndex(prev.riskLevel);
  const riskImproved = prev && riskIndex(snapshot.riskLevel) < riskIndex(prev.riskLevel);

  return (
    <div className="relative pl-6">
      <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
      <div className={cn(
        'absolute left-[-4px] top-4 h-2 w-2 rounded-full border-2 border-background',
        isLatest ? 'bg-primary' : 'bg-muted-foreground/40',
      )} />

      <Card className={cn(
        'mb-3',
        isDropout && 'border-risk-critico/40 bg-risk-critico-bg/20',
        riskWorsened && 'border-risk-risco/30',
        riskImproved && 'border-green-500/30',
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">
                {format(new Date(snapshot.synchronizedAt), "dd 'de' MMM yyyy", { locale: ptBR })}
              </span>
              <span className="text-xs text-muted-foreground">
                ({formatDistanceToNow(new Date(snapshot.synchronizedAt), { addSuffix: true, locale: ptBR })})
              </span>
              {snapshot.course && (
                <Badge variant="outline" className="text-xs">
                  {snapshot.course.shortName || snapshot.course.name}
                </Badge>
              )}
            </div>
            <RiskBadge level={snapshot.riskLevel} size="sm" />
          </div>

          {isDropout && (
            <div className="flex items-center gap-2 mb-3 rounded-md bg-risk-critico/10 px-3 py-2 text-sm text-risk-risco">
              <TrendingDown className="h-4 w-4 shrink-0" />
              <span>
                Sem acesso há {snapshot.daysSinceAccess} dias — possível desistente. Solicite à escola atualização do registro.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Último acesso</p>
                <p className="font-medium">
                  {snapshot.lastAccessAt
                    ? formatDistanceToNow(new Date(snapshot.lastAccessAt), { addSuffix: true, locale: ptBR })
                    : 'Nunca'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className={cn('font-medium', snapshot.pendingActivities > 0 && 'text-yellow-600')}>
                  {snapshot.pendingActivities}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Atrasadas</p>
                <p className={cn('font-medium', snapshot.overdueActivities > 0 && 'text-risk-risco')}>
                  {snapshot.overdueActivities}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Matrícula</p>
              <p className="font-medium">
                {enrollmentStatusLabel[snapshot.enrollmentStatus] ?? snapshot.enrollmentStatus}
              </p>
            </div>
          </div>

          {(riskLevelChanged || accessGot) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {riskLevelChanged && riskWorsened && (
                <Badge variant="outline" className="text-xs border-risk-risco text-risk-risco">Risco piorou</Badge>
              )}
              {riskLevelChanged && riskImproved && (
                <Badge variant="outline" className="text-xs border-green-600 text-green-700">Risco melhorou</Badge>
              )}
              {accessGot && (
                <Badge variant="outline" className="text-xs border-green-600 text-green-700">Acesso aumentou</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function StudentHistoryTab({ studentId }: { studentId: string }) {
  const { data: snapshots, isLoading, error } = useStudentHistory(studentId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-8 text-muted-foreground"><p>Erro ao carregar histórico.</p></div>;
  }

  if (snapshots.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Nenhum histórico registrado</p>
        <p className="text-sm mt-1">O histórico é gerado automaticamente a cada sincronização com o Moodle.</p>
      </div>
    );
  }

  const mostRecentSyncedAt = snapshots.reduce((maximum, snapshot) => {
    const time = Date.parse(snapshot.synchronizedAt);
    return Number.isNaN(time) ? maximum : Math.max(maximum, time);
  }, Number.NEGATIVE_INFINITY);

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground mb-4">
        {snapshots.length} {snapshots.length === 1 ? 'registro' : 'registros'} de sincronização.
        Priorizando unidades atuais e futuras; unidades já encerradas aparecem por último.
      </p>
      {snapshots.map((snapshot, index) => (
        <SnapshotCard
          key={snapshot.id}
          snapshot={snapshot}
          prev={snapshots.slice(index + 1).find((candidate) => candidate.courseId === snapshot.courseId)}
          isLatest={Date.parse(snapshot.synchronizedAt) === mostRecentSyncedAt}
        />
      ))}
    </div>
  );
}
