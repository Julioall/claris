import { Fragment, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listAdminLogs, resolveAdminLog } from '../api/logs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, endOfDay, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, ChevronDown, ChevronUp, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { exportToCsv } from '@/lib/csv';

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

const PAGE_SIZE = 30;

export default function AdminLogsErros() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [resolvedFilter, setResolvedFilter] = useState<string>('open');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, severityFilter, categoryFilter, resolvedFilter, dateFrom, dateTo]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-error-logs', severityFilter, categoryFilter, resolvedFilter, dateFrom, dateTo, search, page],
    queryFn: async () => {
      return listAdminLogs({
        severity: severityFilter !== 'all' ? severityFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        resolved: resolvedFilter === 'all' ? undefined : resolvedFilter === 'resolved',
        dateFrom: dateFrom ? startOfDay(new Date(dateFrom)).toISOString() : undefined,
        dateTo: dateTo ? endOfDay(new Date(dateTo)).toISOString() : undefined,
        search,
        page,
        pageSize: PAGE_SIZE,
      });
    },
  });

  const logs = (data?.items ?? []) as ErrorLog[];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await resolveAdminLog(id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-error-logs'] });
      toast({ title: 'Erro marcado como resolvido' });
    },
  });

  const handleExport = () => {
    exportToCsv(
      `logs-erros-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`,
      logs.map((l) => ({
        id: l.id,
        user_id: l.user_id ?? '',
        severity: l.severity,
        category: l.category,
        message: l.message,
        resolved: String(l.resolved),
        resolved_at: l.resolved_at ?? '',
        created_at: l.created_at,
      })),
    );
  };

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Logs de Erro</h1>
          <p className="text-muted-foreground">Monitore e resolva erros da plataforma</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={logs.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
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
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[150px]"
              title="Data inicial"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[150px]"
              title="Data final"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : logs.length === 0 ? (
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
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <TableRow
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
                      <TableRow>
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
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalCount > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Exibindo {(page - 1) * PAGE_SIZE + (logs.length > 0 ? 1 : 0)}-{(page - 1) * PAGE_SIZE + logs.length} de {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
            >
              Próxima
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
