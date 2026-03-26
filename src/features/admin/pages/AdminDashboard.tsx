import { useQuery } from '@tanstack/react-query';
import {
  fetchAppErrorLogsCount,
  fetchAppUsageEventsCount,
  fetchClarisConversationsCount,
  fetchOpenSupportTicketsCount,
  fetchUsersCount,
  listRecentUsageEvents,
} from '../api/metrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertTriangle, LifeBuoy, MessageSquare, Users } from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
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
  const { data: usageCount } = useQuery({
    queryKey: ['admin-usage-count'],
    queryFn: async () => {
      const { count } = await fetchAppUsageEventsCount();
      return count ?? 0;
    },
  });

  const { data: errorCount } = useQuery({
    queryKey: ['admin-error-count'],
    queryFn: async () => {
      const { count } = await fetchAppErrorLogsCount({ resolved: false });
      return count ?? 0;
    },
  });

  const { data: ticketCount } = useQuery({
    queryKey: ['admin-ticket-count'],
    queryFn: async () => {
      const { count } = await fetchOpenSupportTicketsCount();
      return count ?? 0;
    },
  });

  const { data: conversationCount } = useQuery({
    queryKey: ['admin-conversation-count'],
    queryFn: async () => {
      const { count } = await fetchClarisConversationsCount();
      return count ?? 0;
    },
  });

  const { data: userCount } = useQuery({
    queryKey: ['admin-user-count'],
    queryFn: async () => {
      const { count } = await fetchUsersCount();
      return count ?? 0;
    },
  });

  // Trend: events per day for the last 7 days
  const { data: recentEvents = [] } = useQuery({
    queryKey: ['admin-recent-events-trend'],
    queryFn: async () => {
      const since = subDays(new Date(), 6);
      since.setHours(0, 0, 0, 0);
      const { data } = await listRecentUsageEvents(since.toISOString());
      return (data ?? []) as { created_at: string }[];
    },
  });

  const trendData = Array.from({ length: 7 }, (_, i) => {
    const d = startOfDay(subDays(new Date(), 6 - i));
    const nextD = startOfDay(subDays(new Date(), 5 - i));
    const count = recentEvents.filter((e) => {
      const t = new Date(e.created_at);
      return t >= d && t < nextD;
    }).length;
    return { date: format(d, 'dd/MM', { locale: ptBR }), eventos: count };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Painel Administrativo</h1>
        <p className="text-muted-foreground">Visão geral da plataforma Claris</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Usuários"
          value={userCount ?? '—'}
          icon={Users}
          description="Total de usuários cadastrados"
        />
        <StatCard
          title="Eventos de Uso"
          value={usageCount ?? '—'}
          icon={Activity}
          description="Eventos registrados no total"
        />
        <StatCard
          title="Erros Abertos"
          value={errorCount ?? '—'}
          icon={AlertTriangle}
          description="Erros não resolvidos"
        />
        <StatCard
          title="Tickets Abertos"
          value={ticketCount ?? '—'}
          icon={LifeBuoy}
          description="Tickets de suporte abertos"
        />
        <StatCard
          title="Conversas Claris"
          value={conversationCount ?? '—'}
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
