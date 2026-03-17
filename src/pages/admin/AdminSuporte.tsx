import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface SupportTicket {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  description: string;
  route: string | null;
  context: Record<string, unknown>;
  status: string;
  priority: string;
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  aberto: 'bg-blue-100 text-blue-800',
  em_andamento: 'bg-yellow-100 text-yellow-800',
  resolvido: 'bg-green-100 text-green-800',
  fechado: 'bg-gray-100 text-gray-800',
};

const PRIORITY_COLORS: Record<string, string> = {
  baixa: 'secondary',
  normal: 'outline',
  alta: 'default',
  critica: 'destructive',
};

export default function AdminSuporte() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [newTicketCount, setNewTicketCount] = useState(0);

  // Realtime subscription for new tickets
  useEffect(() => {
    const channel = supabase
      .channel('admin-support-tickets-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_tickets' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
          setNewTicketCount((prev) => prev + 1);
          toast({ title: 'Novo ticket de suporte recebido!' });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['admin-support-tickets', statusFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (typeFilter !== 'all') query = query.eq('type', typeFilter);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes: string }) => {
      const update: Record<string, unknown> = { status, admin_notes: notes };
      if (status === 'resolvido') update.resolved_at = new Date().toISOString();
      const { error } = await supabase.from('support_tickets').update(update).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
      toast({ title: 'Ticket atualizado com sucesso' });
    },
  });

  const filtered = tickets.filter((t) => {
    if (!search) return true;
    return t.title.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tickets de Suporte</h1>
          <p className="text-muted-foreground">Gerencie os tickets de suporte dos usuarios</p>
        </div>
        {newTicketCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNewTicketCount(0)}
            className="relative"
          >
            <Bell className="h-4 w-4 mr-2" />
            {newTicketCount} novo{newTicketCount > 1 ? 's' : ''} ticket{newTicketCount > 1 ? 's' : ''}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por titulo ou descricao..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="aberto">Aberto</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="resolvido">Resolvido</SelectItem>
                <SelectItem value="fechado">Fechado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="problema">Problema</SelectItem>
                <SelectItem value="sugestao">Sugestao</SelectItem>
                <SelectItem value="duvida">Duvida</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum ticket encontrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titulo</TableHead>
                  <TableHead className="w-[100px]">Tipo</TableHead>
                  <TableHead className="w-[120px]">Prioridade</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[140px]">Data</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ticket) => (
                  <>
                    <TableRow
                      key={ticket.id}
                      className="cursor-pointer"
                      onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
                    >
                      <TableCell className="text-sm font-medium">{ticket.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">{ticket.type}</TableCell>
                      <TableCell>
                        <Badge variant={(PRIORITY_COLORS[ticket.priority] ?? 'outline') as 'default' | 'secondary' | 'destructive' | 'outline'}>
                          {ticket.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[ticket.status] ?? 'bg-gray-100 text-gray-800'}`}>
                          {ticket.status.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(ticket.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {expandedId === ticket.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </TableCell>
                    </TableRow>
                    {expandedId === ticket.id && (
                      <TableRow key={`${ticket.id}-detail`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-4">
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Descricao</p>
                              <p className="text-sm">{ticket.description}</p>
                            </div>
                            {ticket.route && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Rota</p>
                                <p className="text-sm font-mono">{ticket.route}</p>
                              </div>
                            )}
                            {ticket.admin_notes && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Notas do admin</p>
                                <p className="text-sm">{ticket.admin_notes}</p>
                              </div>
                            )}
                            <div className="space-y-2">
                              <Label className="text-xs">Notas internas</Label>
                              <Textarea
                                placeholder="Adicione notas sobre o andamento..."
                                value={adminNotes[ticket.id] ?? ticket.admin_notes ?? ''}
                                onChange={(e) => setAdminNotes((prev) => ({ ...prev, [ticket.id]: e.target.value }))}
                                rows={3}
                              />
                            </div>
                            <div className="flex gap-2">
                              {['em_andamento', 'resolvido', 'fechado'].map((status) => (
                                <Button
                                  key={status}
                                  size="sm"
                                  variant={ticket.status === status ? 'default' : 'outline'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateTicketMutation.mutate({
                                      id: ticket.id,
                                      status,
                                      notes: adminNotes[ticket.id] ?? ticket.admin_notes ?? '',
                                    });
                                  }}
                                  disabled={updateTicketMutation.isPending}
                                >
                                  {status.replace('_', ' ')}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
