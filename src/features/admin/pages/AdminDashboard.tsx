import { useQuery } from '@tanstack/react-query';
import { fetchAdminDashboardSummary } from '../api/metrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertTriangle, LifeBuoy, MessageSquare, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description?: string;
}

function StatCard({ title, value, icon: Icon, description }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data: summary } = useQuery({
    queryKey: ['admin-dashboard-summary'],
    queryFn: fetchAdminDashboardSummary,
  });

  const trendData = (summary?.usageTrend ?? []).map(({ day, count }) => ({
    date: format(new Date(`${day}T12:00:00`), 'dd/MM', { locale: ptBR }),
    eventos: count,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Painel Administrativo</h1>
        <p className="text-muted-foreground">Visão geral da plataforma Claris</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Usuários"
          value={summary?.counts.users ?? '—'}
          icon={Users}
          description="Total de usuários cadastrados"
        />
        <StatCard
          title="Eventos de Uso"
          value={summary?.counts.usageEvents ?? '—'}
          icon={Activity}
          description="Eventos registrados no total"
        />
        <StatCard
          title="Erros Abertos"
          value={summary?.counts.openErrorLogs ?? '—'}
          icon={AlertTriangle}
          description="Erros não resolvidos"
        />
        <StatCard
          title="Tickets Abertos"
          value={summary?.counts.openSupportTickets ?? '—'}
          icon={LifeBuoy}
          description="Tickets de suporte abertos"
        />
        <StatCard
          title="Conversas Claris"
          value={summary?.counts.clarisConversations ?? '—'}
          icon={MessageSquare}
          description="Total de conversas com a IA"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atividade recente (eventos por dia — ultimos 7 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="eventos" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
