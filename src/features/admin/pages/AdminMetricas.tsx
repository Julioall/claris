import { Fragment, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMoodleSyncOperationalMetrics, listUsageEvents } from '../api/metrics';
import type {
  AdminMoodleSyncOperationalMetricDto,
  AdminUsageEventDto,
} from '../api/contracts/admin-observability.contract';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, ChevronDown, ChevronUp, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { exportToCsv } from '@/lib/csv';

const PAGE_SIZE = 50;

function formatDurationMs(value: number): string {
  if (value < 1_000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} s`;
  return `${(value / 60_000).toFixed(1)} min`;
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 * 1_024) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / (1_024 * 1_024)).toFixed(1)} MB`;
}

export default function AdminMetricas() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, userFilter, dateFrom, dateTo]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-usage-events', typeFilter, userFilter, dateFrom, dateTo, search, page],
    queryFn: async () => {
      return listUsageEvents({
        eventType: typeFilter !== 'all' ? typeFilter : undefined,
        userId: userFilter.trim() || undefined,
        dateFrom: dateFrom ? startOfDay(new Date(dateFrom)).toISOString() : undefined,
        dateTo: dateTo ? endOfDay(new Date(dateTo)).toISOString() : undefined,
        search,
        page,
        pageSize: PAGE_SIZE,
      });
    },
  });

  const { data: moodleSyncMetrics } = useQuery({
    queryKey: ['admin-moodle-sync-operational-metrics', 168, 300],
    queryFn: () => fetchMoodleSyncOperationalMetrics(),
  });

  const events: AdminUsageEventDto[] = data?.items ?? [];
  const moodleMetrics: AdminMoodleSyncOperationalMetricDto[] = moodleSyncMetrics?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Aggregate events by type for bar chart
  const eventsByType = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.eventType] = (acc[event.eventType] ?? 0) + 1;
    return acc;
  }, {});

  const chartData = Object.entries(eventsByType)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Trend: events per day for the last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = startOfDay(subDays(new Date(), 6 - i));
    return format(d, 'dd/MM', { locale: ptBR });
  });

  const trendData = last7Days.map((label, i) => {
    const d = startOfDay(subDays(new Date(), 6 - i));
    const nextD = startOfDay(subDays(new Date(), 5 - i));
    const count = events.filter((e) => {
      const t = new Date(e.createdAt);
      return t >= d && t < nextD;
    }).length;
    return { date: label, eventos: count };
  });

  const uniqueTypes = Array.from(new Set(events.map((e) => e.eventType)));

  const handleExport = () => {
    exportToCsv(
      `metricas-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`,
      events.map((e) => ({
        id: e.id,
        user_id: e.userId ?? '',
        event_type: e.eventType,
        route: e.route ?? '',
        resource: e.resource ?? '',
        created_at: e.createdAt,
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
          <h1 className="text-2xl font-bold tracking-tight">Metricas de Uso</h1>
          <p className="text-muted-foreground">Acompanhe os eventos de uso da plataforma</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={events.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 10 eventos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos por dia (ultimos 7 dias)</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operação Moodle por site e conexão (últimos 7 dias)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {moodleMetrics.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhuma sincronização Moodle ativa ou concluída no período.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Conexão</TableHead>
                  <TableHead>Jobs</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Chamadas</TableHead>
                  <TableHead title="Tamanho do JSON processado; nao representa bytes de rede">
                    JSON processado
                  </TableHead>
                  <TableHead>P95 job</TableHead>
                  <TableHead>Circuito</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moodleMetrics.map((metric) => (
                  <TableRow key={`${metric.siteSlug}:${metric.connectionId}`}>
                    <TableCell className="font-medium uppercase">{metric.siteSlug}</TableCell>
                    <TableCell className="font-mono text-xs">{metric.connectionId.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">
                      {metric.jobs.completed} concluídos · {metric.jobs.failed} falhos · {metric.activeJobs} ativos
                    </TableCell>
                    <TableCell className="text-xs">
                      {metric.items.completed} concluídos · {metric.items.failed} falhos · {metric.items.stuck} presos
                    </TableCell>
                    <TableCell>{metric.retryAttempts}</TableCell>
                    <TableCell>{metric.transport.apiCalls}</TableCell>
                    <TableCell>{formatBytes(metric.transport.responseBytes)}</TableCell>
                    <TableCell>{formatDurationMs(metric.durations.p95JobMs)}</TableCell>
                    <TableCell className={metric.circuit.state === 'open' ? 'text-destructive font-medium' : ''}>
                      {metric.circuit.state === 'open' ? 'Aberto' : 'Fechado'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por tipo ou rota..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo de evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {uniqueTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Filtrar por User ID"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-[220px] font-mono text-xs"
            />
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
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum evento encontrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead className="w-[200px]">Rota</TableHead>
                  <TableHead className="w-[200px]">Recurso</TableHead>
                  <TableHead className="w-[160px]">Data</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <Fragment key={event.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                    >
                      <TableCell className="text-sm font-medium">{event.eventType}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{event.route ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{event.resource ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(event.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {expandedId === event.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </TableCell>
                    </TableRow>
                    {expandedId === event.id && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30 p-4">
                          <pre className="text-xs overflow-auto max-h-32">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
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
            Exibindo {(page - 1) * PAGE_SIZE + (events.length > 0 ? 1 : 0)}-{(page - 1) * PAGE_SIZE + events.length} de {totalCount}
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
