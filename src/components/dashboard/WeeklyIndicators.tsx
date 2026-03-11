import {
  AlertTriangle,
  ClipboardList,
  Clock,
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
          title="Pendencias Abertas"
          value={summary.pending_tasks}
          subtitle="a resolver"
          icon={ClipboardList}
          variant={summary.pending_tasks > 5 ? 'warning' : 'default'}
        />
        <StatCard
          title="Pendencias Atrasadas"
          value={summary.overdue_tasks}
          subtitle={summary.overdue_tasks > 0 ? 'exigem atencao' : undefined}
          icon={Clock}
          variant={summary.overdue_tasks > 0 ? 'warning' : 'default'}
        />
        <StatCard
          title="Alunos em Risco"
          value={summary.students_at_risk}
          subtitle={summary.new_at_risk_this_week > 0 ? `+${summary.new_at_risk_this_week} novos` : undefined}
          icon={AlertTriangle}
          trend={summary.new_at_risk_this_week > 0 ? {
            value: summary.new_at_risk_this_week,
            label: 'esta semana',
            positive: false,
          } : undefined}
          variant="danger"
        />
        <StatCard
          title="Novos em Risco"
          value={summary.new_at_risk_this_week}
          subtitle="na semana selecionada"
          icon={AlertTriangle}
          variant={summary.new_at_risk_this_week > 0 ? 'warning' : 'default'}
        />
      </div>
    </div>
  );
}
