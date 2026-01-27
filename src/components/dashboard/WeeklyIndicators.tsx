import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Users, 
  UserX,
  ClipboardList
} from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { WeeklySummary } from '@/types';

interface WeeklyIndicatorsProps {
  summary: WeeklySummary;
}

export function WeeklyIndicators({ summary }: WeeklyIndicatorsProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Indicadores da Semana</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard
          title="Ações Concluídas"
          value={summary.completed_actions}
          subtitle="esta semana"
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          title="Ações Pendentes"
          value={summary.pending_actions}
          subtitle={summary.overdue_actions > 0 ? `${summary.overdue_actions} atrasadas` : undefined}
          icon={Clock}
          variant={summary.overdue_actions > 0 ? 'warning' : 'default'}
        />
        <StatCard
          title="Pendências Abertas"
          value={summary.pending_tasks}
          subtitle="a resolver"
          icon={ClipboardList}
          variant={summary.pending_tasks > 5 ? 'warning' : 'default'}
        />
        <StatCard
          title="Alunos em Risco"
          value={summary.students_at_risk}
          subtitle={summary.new_at_risk_this_week > 0 ? `+${summary.new_at_risk_this_week} novos` : undefined}
          icon={AlertTriangle}
          trend={summary.new_at_risk_this_week > 0 ? {
            value: summary.new_at_risk_this_week,
            label: 'esta semana',
            positive: false
          } : undefined}
          variant="danger"
        />
        <StatCard
          title="Sem Contato Recente"
          value={summary.students_without_contact}
          subtitle="há mais de 7 dias"
          icon={UserX}
          variant={summary.students_without_contact > 0 ? 'warning' : 'default'}
        />
      </div>
    </div>
  );
}
