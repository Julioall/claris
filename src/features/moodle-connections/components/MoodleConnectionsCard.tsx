import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Link2, Unplug } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { disconnectMoodleConnection, listMoodleConnections } from '../api/moodle-connections.client';

export function MoodleConnectionsCard() {
  const queryClient = useQueryClient();
  const connections = useQuery({ queryKey: ['moodle-connections'], queryFn: listMoodleConnections });
  const disconnect = useMutation({
    mutationFn: disconnectMoodleConnection,
    onSuccess: ({ pendingLeases }) => {
      void queryClient.invalidateQueries({ queryKey: ['moodle-connections'] });
      toast({
        title: pendingLeases > 0 ? 'Desconexao em andamento' : 'Conexao removida',
        description: pendingLeases > 0
          ? 'Os jobs ativos foram cancelados e o segredo sera removido ao fim dos leases.'
          : 'Os dados ja sincronizados foram preservados na Claris.',
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" />Conexoes Moodle</CardTitle>
        <CardDescription>Cada conexao possui identidade, credencial e estado isolados.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(connections.data ?? []).filter((item) => item.status !== 'disabled').map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><p className="font-medium">{item.alias}</p><Badge variant={item.status === 'active' ? 'default' : 'secondary'}>{item.status}</Badge></div>
              <p className="text-xs text-muted-foreground">{item.site.name} · {item.usernameMasked}</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={disconnect.isPending} onClick={() => disconnect.mutate(item.id)}><Unplug className="mr-2 h-4 w-4" />Desconectar</Button>
          </div>
        ))}
        {!connections.isLoading && (connections.data ?? []).filter((item) => item.status !== 'disabled').length === 0 && <p className="text-sm text-muted-foreground">Nenhum Moodle conectado.</p>}
        <Button asChild variant="outline" className="w-full"><Link to="/onboarding/moodle">Adicionar conexao Moodle</Link></Button>
      </CardContent>
    </Card>
  );
}
