import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  LoaderCircle,
  RotateCcw,
  Search,
  Siren,
  Workflow,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  cancelAdminBackgroundJob,
  canAdminCancelBackgroundJob,
  canAdminForceTerminateBackgroundJob,
  canAdminRetryBackgroundJob,
  forceTerminateAdminBackgroundJob,
  getAdminBackgroundJobDetails,
  listAdminBackgroundJobs,
  retryAdminBackgroundJob,
  type AdminBackgroundJobDetails,
  type AdminBackgroundJobRow,
} from '../api/backgroundJobs';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos status' },
  { value: 'pending', label: 'Na fila' },
  { value: 'processing', label: 'Processando' },
  { value: 'completed', label: 'Concluído' },
  { value: 'failed', label: 'Falhou' },
  { value: 'cancelled', label: 'Cancelado' },
];

const SOURCE_OPTIONS = [
  { value: 'all', label: 'Todas origens' },
  { value: 'messages', label: 'Mensagens' },
  { value: 'scheduler', label: 'Agendador' },
  { value: 'services', label: 'Servicos' },
  { value: 'ai-grading', label: 'Correção IA' },
  { value: 'sync', label: 'Sincronização' },
];

const JOB_TYPE_OPTIONS = [
  { value: 'all', label: 'Todos tipos' },
  { value: 'bulk_message', label: 'Envio em massa' },
  { value: 'scheduled_message', label: 'Agendamento de mensagem' },
  { value: 'service_instance_job', label: 'Execucao de servico' },
  { value: 'ai_grade_suggestion', label: 'Sugestão de nota IA' },
  { value: 'moodle_deep_sync', label: 'Sync profunda Moodle' },
];

const PAGE_SIZE = 30;

function formatDateTime(value?: string | null) {
  if (!value) return '—';

  return format(parseISO(value), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
}

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Na fila', variant: 'outline' },
    processing: { label: 'Processando', variant: 'default' },
    completed: { label: 'Concluído', variant: 'secondary' },
    failed: { label: 'Falhou', variant: 'destructive' },
    cancelled: { label: 'Cancelado', variant: 'outline' },
  };

  const current = map[status] ?? { label: status, variant: 'outline' as const };
  return <Badge variant={current.variant}>{current.label}</Badge>;
}

function getSourceBadge(source: string) {
  const map: Record<string, string> = {
    messages: 'Mensagens',
    scheduler: 'Agendador',
    services: 'Servicos',
    'ai-grading': 'Correção IA',
    sync: 'Sincronização',
  };

  return <Badge variant="outline">{map[source] ?? source}</Badge>;
}

function StatCard(props: {
  title: string;
  value: number;
  icon: React.ElementType;
  tone?: string;
}) {
  const Icon = props.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{props.title}</CardTitle>
        <Icon className={`h-4 w-4 ${props.tone ?? 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${props.tone ?? ''}`}>{props.value}</div>
      </CardContent>
    </Card>
  );
}

function canShowActions(job: AdminBackgroundJobRow) {
  return canAdminRetryBackgroundJob(job) || canAdminCancelBackgroundJob(job) || canAdminForceTerminateBackgroundJob(job);
}

function JobDetails({ details }: { details: AdminBackgroundJobDetails }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Card className="border-dashed lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Contexto do Job</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-48 overflow-auto rounded bg-background p-3 text-xs">
            {JSON.stringify(details.job.metadata ?? {}, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Itens do Job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {details.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item registrado.</p>
          ) : (
            details.items.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.progress_total > 0
                        ? `${item.progress_current}/${item.progress_total}`
                        : 'Sem progresso detalhado'}
                    </p>
                  </div>
                  {getStatusBadge(item.status)}
                </div>
                {item.error_message ? (
                  <p className="mt-2 text-xs text-destructive">{item.error_message}</p>
                ) : null}
                {item.metadata && Object.keys(item.metadata as Record<string, unknown>).length > 0 ? (
                  <pre className="mt-2 max-h-32 overflow-auto rounded bg-background p-2 text-xs">
                    {JSON.stringify(item.metadata, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Eventos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {details.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
          ) : (
            details.events.map((event) => (
              <div key={event.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{event.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.event_type} · {formatDateTime(event.created_at)}
                    </p>
                  </div>
                  <Badge variant={event.level === 'error' ? 'destructive' : 'outline'}>
                    {event.level}
                  </Badge>
                </div>
                {event.metadata && Object.keys(event.metadata as Record<string, unknown>).length > 0 ? (
                  <pre className="mt-2 max-h-32 overflow-auto rounded bg-background p-2 text-xs">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminJobs() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [jobTypeFilter, setJobTypeFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sourceFilter, jobTypeFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-background-jobs', statusFilter, sourceFilter, jobTypeFilter, search, page],
    queryFn: () => listAdminBackgroundJobs({
      status: statusFilter as 'all',
      source: sourceFilter,
      jobType: jobTypeFilter,
      search,
      page,
      pageSize: PAGE_SIZE,
    }),
  });

  const jobs = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const { data: details } = useQuery({
    queryKey: ['admin-background-job-detail', expandedId],
    queryFn: () => getAdminBackgroundJobDetails(expandedId!),
    enabled: !!expandedId,
  });

  const stats = useMemo(() => ({
    total: totalCount,
    processing: jobs.filter((job) => job.status === 'pending' || job.status === 'processing').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
    completed: jobs.filter((job) => job.status === 'completed').length,
  }), [jobs, totalCount]);

  const toggleExpanded = (jobId: string) => {
    setExpandedId((current) => current === jobId ? null : jobId);
  };

  const refreshAdminJobs = async (jobId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-background-jobs'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-background-job-detail', jobId] }),
    ]);
  };

  const retryMutation = useMutation({
    mutationFn: retryAdminBackgroundJob,
    onSuccess: async (_data, job) => {
      toast.success('Job reenfileirado. O scheduler executara na proxima rodada.');
      await refreshAdminJobs(job.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao reenfileirar job.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelAdminBackgroundJob,
    onSuccess: async (_data, job) => {
      toast.success('Agendamento cancelado.');
      await refreshAdminJobs(job.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao cancelar job.');
    },
  });

  const forceTerminateMutation = useMutation({
    mutationFn: forceTerminateAdminBackgroundJob,
    onSuccess: async (_data, job) => {
      toast.success('Job interrompido forçadamente.');
      await refreshAdminJobs(job.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao interromper job.');
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Jobs em Background</h1>
        <p className="text-muted-foreground">
          Painel operacional unificado para envios, correção por IA e sincronizações profundas.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total" value={stats.total} icon={Workflow} />
        <StatCard title="Em andamento" value={stats.processing} icon={Clock3} tone="text-blue-600" />
        <StatCard title="Concluídos" value={stats.completed} icon={Activity} tone="text-green-600" />
        <StatCard title="Com falha" value={stats.failed} icon={Siren} tone="text-destructive" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por job, usuário ou origem..."
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOB_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando jobs...</div>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum job encontrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Progresso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job: AdminBackgroundJobRow) => {
                  const isExpanded = expandedId === job.id;
                  const progressLabel = job.total_items > 0
                    ? `${job.processed_items}/${job.total_items}`
                    : '—';

                  return (
                    <Fragment key={job.id}>
                      <TableRow className="cursor-pointer" onClick={() => toggleExpanded(job.id)}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{job.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {job.description || job.job_type}
                            </p>
                            {job.error_message ? (
                              <p className="text-xs text-destructive">{job.error_message}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {getSourceBadge(job.source)}
                            <Badge variant="outline">{job.job_type}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm">{job.user?.full_name || job.user_id}</p>
                            <p className="text-xs text-muted-foreground">
                              {job.user?.moodle_username || 'Sem usuário associado'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="space-y-1">
                            <p>{progressLabel}</p>
                            <p className="text-xs text-muted-foreground">
                              {job.success_count} sucesso(s) · {job.error_count} erro(s)
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(job.created_at)}
                        </TableCell>
                        <TableCell>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </TableCell>
                      </TableRow>

                      {isExpanded ? (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/20 p-4">
                            <div className="space-y-4">
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <Card className="border-dashed">
                                  <CardContent className="p-3">
                                    <p className="text-xs text-muted-foreground">Início</p>
                                    <p className="mt-1 text-sm font-medium">{formatDateTime(job.started_at)}</p>
                                  </CardContent>
                                </Card>
                                <Card className="border-dashed">
                                  <CardContent className="p-3">
                                    <p className="text-xs text-muted-foreground">Fim</p>
                                    <p className="mt-1 text-sm font-medium">{formatDateTime(job.completed_at)}</p>
                                  </CardContent>
                                </Card>
                                <Card className="border-dashed">
                                  <CardContent className="p-3">
                                    <p className="text-xs text-muted-foreground">Tabela de origem</p>
                                    <p className="mt-1 text-sm font-medium">{job.source_table || 'Nativa'}</p>
                                  </CardContent>
                                </Card>
                                <Card className="border-dashed">
                                  <CardContent className="p-3">
                                    <p className="text-xs text-muted-foreground">Registro de origem</p>
                                    <p className="mt-1 truncate text-sm font-medium">{job.source_record_id || '—'}</p>
                                  </CardContent>
                                </Card>
                              </div>

                              {canShowActions(job) ? (
                                <Card className="border-dashed">
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-sm">Acoes Operacionais</CardTitle>
                                  </CardHeader>
                                  <CardContent className="flex flex-wrap items-center gap-3">
                                    {canAdminRetryBackgroundJob(job) ? (
                                      <Button
                                        size="sm"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          retryMutation.mutate(job);
                                        }}
                                        disabled={retryMutation.isPending || cancelMutation.isPending || forceTerminateMutation.isPending}
                                      >
                                        {retryMutation.isPending && retryMutation.variables?.id === job.id ? (
                                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <RotateCcw className="mr-2 h-4 w-4" />
                                        )}
                                        Reenfileirar
                                      </Button>
                                    ) : null}

                                    {canAdminCancelBackgroundJob(job) ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          cancelMutation.mutate(job);
                                        }}
                                        disabled={retryMutation.isPending || cancelMutation.isPending || forceTerminateMutation.isPending}
                                      >
                                        {cancelMutation.isPending && cancelMutation.variables?.id === job.id ? (
                                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <XCircle className="mr-2 h-4 w-4" />
                                        )}
                                        Cancelar
                                      </Button>
                                    ) : null}

                                    {canAdminForceTerminateBackgroundJob(job) ? (
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          forceTerminateMutation.mutate(job);
                                        }}
                                        disabled={forceTerminateMutation.isPending || retryMutation.isPending || cancelMutation.isPending}
                                      >
                                        {forceTerminateMutation.isPending && forceTerminateMutation.variables?.id === job.id ? (
                                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <XCircle className="mr-2 h-4 w-4" />
                                        )}
                                        Forçar Cancelamento
                                      </Button>
                                    ) : null}

                                    <p className="text-xs text-muted-foreground">
                                      Jobs reenfileirados voltam para a fila e serao executados na proxima rodada automatica.
                                      Forcar cancelamento encerra o registro do job sem afetar o processamento em andamento.
                                    </p>
                                  </CardContent>
                                </Card>
                              ) : null}

                              {details?.job.id === job.id ? (
                                <JobDetails details={details} />
                              ) : (
                                <p className="text-sm text-muted-foreground">Carregando detalhes...</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalCount > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Exibindo {(page - 1) * PAGE_SIZE + (jobs.length > 0 ? 1 : 0)}-{(page - 1) * PAGE_SIZE + jobs.length} de {totalCount}
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
