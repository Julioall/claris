import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ErrorLog {
  id: string;
  user_id: string | null;
  severity: string;
  category: string;
  message: string;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  critical: 'bg-red-900 text-red-100',
};

export default function AdminLogsErros() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [resolvedFilter, setResolvedFilter] = useState<string>('open');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['admin-error-logs', severityFilter, categoryFilter, resolvedFilter],
    queryFn: async () => {
      let query = supabase
        .from('app_error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (severityFilter !== 'all') query = query.eq('severity', severityFilter);
      if (categoryFilter !== 'all') query = query.eq('category', categoryFilter);
      if (resolvedFilter === 'open') query = query.eq('resolved', false);
      if (resolvedFilter === 'resolved') query = query.eq('resolved', true);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ErrorLog[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('app_error_logs')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-error-logs'] });
      toast({ title: 'Erro marcado como resolvido' });
    },
  });

  const filtered = logs.filter((log) => {
    if (!search) return true;
    return log.message.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logs de Erro</h1>
        <p className="text-muted-foreground">Monitore e resolva erros da plataforma</p>
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
                placeholder="Buscar por mensagem..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Severidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="ui">UI</SelectItem>
                <SelectItem value="import">Importacao</SelectItem>
                <SelectItem value="integration">Integracao</SelectItem>
                <SelectItem value="edge_function">Edge Function</SelectItem>
                <SelectItem value="ai">IA</SelectItem>
                <SelectItem value="auth">Auth</SelectItem>
                <SelectItem value="other">Outros</SelectItem>
              </SelectContent>
            </Select>
            <Select value={resolvedFilter} onValueChange={setResolvedFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Abertos</SelectItem>
                <SelectItem value="resolved">Resolvidos</SelectItem>
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
            <div className="p-8 text-center text-muted-foreground">Nenhum log encontrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Severidade</TableHead>
                  <TableHead className="w-[120px]">Categoria</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="w-[160px]">Data</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <>
                    <TableRow
                      key={log.id}
                      className="cursor-pointer"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_COLORS[log.severity] ?? 'bg-gray-100 text-gray-800'}`}>
                          {log.severity}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.category}</TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{log.message}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.resolved ? 'secondary' : 'destructive'}>
                          {log.resolved ? 'Resolvido' : 'Aberto'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {expandedId === log.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </TableCell>
                    </TableRow>
                    {expandedId === log.id && (
                      <TableRow key={`${log.id}-detail`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-4">
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Mensagem completa</p>
                              <p className="text-sm">{log.message}</p>
                            </div>
                            {Object.keys(log.payload ?? {}).length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Payload</p>
                                <pre className="text-xs bg-background rounded p-2 overflow-auto max-h-32">
                                  {JSON.stringify(log.payload, null, 2)}
                                </pre>
                              </div>
                            )}
                            {Object.keys(log.context ?? {}).length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Contexto</p>
                                <pre className="text-xs bg-background rounded p-2 overflow-auto max-h-32">
                                  {JSON.stringify(log.context, null, 2)}
                                </pre>
                              </div>
                            )}
                            {!log.resolved && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => { e.stopPropagation(); resolveMutation.mutate(log.id); }}
                                disabled={resolveMutation.isPending}
                              >
                                Marcar como resolvido
                              </Button>
                            )}
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
