import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Eye, CheckCircle2, AlertCircle, Clock, Loader2, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import { listBulkJobs } from '@/features/campaigns/api/campaigns.repository';
import { campaignKeys } from '@/features/campaigns/query-keys';
import type { BulkJobListItem } from '@/features/campaigns/types';
import { JobDetailDialog } from './JobDetailDialog';

interface BulkJobsTabProps {
  mode?: 'full' | 'stats' | 'list';
  title?: string;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pending', label: 'Na fila' },
  { value: 'processing', label: 'Enviando' },
  { value: 'completed', label: 'Concluído' },
  { value: 'failed', label: 'Falhou' },
  { value: 'cancelled', label: 'Cancelado' },
];

const PAGE_SIZE = 20;

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: ReactNode }> = {
    pending: { label: 'Na fila', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
    processing: { label: 'Enviando...', variant: 'default', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    completed: { label: 'Concluído', variant: 'secondary', icon: <CheckCircle2 className="h-3 w-3" /> },
    failed: { label: 'Falhou', variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
    cancelled: { label: 'Cancelado', variant: 'outline', icon: null },
  };
  const cfg = map[status] ?? { label: status, variant: 'outline' as const, icon: null };
  return (
    <Badge variant={cfg.variant} className="gap-1 text-xs">
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

function getOriginBadge(origin: string) {
  return (
    <Badge
      variant="outline"
      className={`text-xs ${origin === 'ia' ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300' : 'bg-muted/40'}`}
    >
      {origin === 'ia' ? 'Claris IA' : 'Manual'}
    </Badge>
  );
}

export function BulkJobsTab({ mode = 'full', title }: BulkJobsTabProps) {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  const { data, isLoading } = useQuery({
    queryKey: campaignKeys.bulkJobs({ status: statusFilter, search, page }),
    queryFn: () => listBulkJobs({ status: statusFilter, search, page, pageSize: PAGE_SIZE }),
    enabled: !!user,
    staleTime: 3 * 60_000,
    refetchInterval: (query) => {
      const paginated = query.state.data as { items?: BulkJobListItem[] } | undefined;
      const hasActive = paginated?.items?.some(j => j.status === 'pending' || j.status === 'processing');
      return hasActive ? 5000 : false;
    },
  });

  const jobs = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const showStats = mode !== 'list';
  const showList = mode !== 'stats';

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div className="space-y-4">
      {title && (
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        </div>
      )}

      {showList && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por conteúdo da mensagem..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Stats summary */}
      {showStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total filtrado', count: totalCount, color: 'text-foreground' },
            { label: 'Em andamento', count: jobs.filter(j => j.status === 'pending' || j.status === 'processing').length, color: 'text-blue-600' },
            { label: 'Concluídos', count: jobs.filter(j => j.status === 'completed').length, color: 'text-green-600' },
            { label: 'Com falha', count: jobs.filter(j => j.status === 'failed').length, color: 'text-destructive' },
          ].map(stat => (
            <Card key={stat.label} className="py-0">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${stat.color}`}>{stat.count}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Jobs list */}
      {showList && (
        isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <p className="text-sm">Nenhum job encontrado</p>
            <p className="text-xs mt-1">Os jobs de envio em massa aparecerão aqui</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map(job => {
              const progress = job.total_recipients > 0
                ? Math.round(((job.sent_count + job.failed_count) / job.total_recipients) * 100)
                : 0;
              return (
                <Card key={job.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {getStatusBadge(job.status)}
                          {getOriginBadge(job.origin)}
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(job.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-sm font-medium line-clamp-2 text-foreground">
                          {job.message_content}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>👥 {job.total_recipients} contatos</span>
                          <span className="text-green-600">✓ {job.sent_count} enviados</span>
                          {job.failed_count > 0 && (
                            <span className="text-destructive">✗ {job.failed_count} falhas</span>
                          )}
                        </div>
                        {(job.status === 'processing' || job.status === 'pending') && job.total_recipients > 0 && (
                          <Progress value={progress} className="h-1.5 mt-2" />
                        )}
                        {job.error_message && (
                          <p className="text-xs text-destructive mt-1 line-clamp-1">{job.error_message}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedJobId(job.id)}
                        className="shrink-0"
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {showList && totalCount > 0 && (
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Exibindo {(page - 1) * PAGE_SIZE + 1}-{(page - 1) * PAGE_SIZE + jobs.length} de {totalCount} jobs
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
            >
              Próxima
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      {showList && (
        <JobDetailDialog
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </div>
  );
}
