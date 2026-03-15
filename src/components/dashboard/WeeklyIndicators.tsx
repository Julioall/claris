import {
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  Clock,
  UserCheck,
} from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { WeeklySummary } from '@/types';

interface WeeklyIndicatorsProps {
  summary: WeeklySummary;
}

export function WeeklyIndicators({ summary }: WeeklyIndicatorsProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Sinais do monitoramento</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Pendências abertas"
          value={summary.pending_tasks}
          subtitle="a resolver"
          icon={ClipboardList}
          variant="pending"
        />
        <StatCard
          title="Pendências atrasadas"
          value={summary.overdue_tasks}
          subtitle={summary.overdue_tasks > 0 ? 'exigem atenção' : undefined}
          icon={Clock}
          variant="risk"
        />
        <StatCard
          title="Atividades para corrigir"
          value={summary.activities_to_review}
          subtitle={summary.activities_to_review > 0
            ? `Envio pendente: ${summary.pending_submission_assignments} • Correção pendente: ${summary.pending_correction_assignments}`
            : 'fila zerada'}
          icon={ClipboardCheck}
          variant="warning"
        />
        <StatCard
          title="Alunos Regulares"
          value={summary.active_normal_students}
          subtitle={summary.active_normal_students > 0 ? 'monitoramento estável' : 'nenhum aluno regular no momento'}
          icon={UserCheck}
          variant="success"
        />
        <StatCard
          title="Alunos em risco"
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
      </div>
    </div>
  );
}
