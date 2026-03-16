import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertTriangle, LifeBuoy, MessageSquare, Users } from 'lucide-react';

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
      const { count } = await supabase
        .from('app_usage_events')
        .select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
  });

  const { data: errorCount } = useQuery({
    queryKey: ['admin-error-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('app_error_logs')
        .select('*', { count: 'exact', head: true })
        .eq('resolved', false);
      return count ?? 0;
    },
  });

  const { data: ticketCount } = useQuery({
    queryKey: ['admin-ticket-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'aberto');
      return count ?? 0;
    },
  });

  const { data: conversationCount } = useQuery({
    queryKey: ['admin-conversation-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('claris_conversations')
        .select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
  });

  const { data: userCount } = useQuery({
    queryKey: ['admin-user-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
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
    </div>
  );
}
