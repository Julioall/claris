import {
  AlertTriangle,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  UserCheck,
} from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';

import type { DashboardIndicatorsDto } from '../api/contracts/dashboard-summary.contract';

interface WeeklyIndicatorsProps {
  summary: DashboardIndicatorsDto;
}

export function WeeklyIndicators({ summary }: WeeklyIndicatorsProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Sinais do monitoramento</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Eventos hoje"
          value={summary.todayEvents}
          subtitle={summary.todayEvents > 0 ? 'na agenda' : 'nenhum evento hoje'}
          icon={CalendarDays}
          variant="pending"
        />
        <StatCard
          title="Tarefas para hoje"
          value={summary.todayTasks}
          subtitle={summary.todayTasks > 0 ? 'com vencimento hoje' : 'nenhuma tarefa hoje'}
          icon={CheckSquare}
          variant="risk"
        />
        <StatCard
          title="Atividades para corrigir"
          value={summary.activitiesToReview}
          subtitle={summary.activitiesToReview > 0
            ? `Envio pendente: ${summary.pendingSubmissionAssignments} • Correção pendente: ${summary.pendingCorrectionAssignments}`
            : 'fila zerada'}
          icon={ClipboardCheck}
          variant="warning"
        />
        <StatCard
          title="Alunos Regulares"
          value={summary.activeNormalStudents}
          subtitle={summary.activeNormalStudents > 0 ? 'monitoramento estável' : 'nenhum aluno regular no momento'}
          icon={UserCheck}
          variant="success"
        />
        <StatCard
          title="Alunos em risco"
          value={summary.studentsAtRisk}
          subtitle={summary.newAtRiskThisWeek > 0 ? `+${summary.newAtRiskThisWeek} novos` : undefined}
          icon={AlertTriangle}
          trend={summary.newAtRiskThisWeek > 0 ? {
            value: summary.newAtRiskThisWeek,
            label: 'esta semana',
            positive: false,
          } : undefined}
          variant="danger"
        />
      </div>
    </div>
  );
}
