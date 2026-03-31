import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  FileText,
  Filter,
  Search,
  Trash2,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

import {
  deleteScheduledMessage,
  listScheduledMessages,
  pauseScheduledMessage,
  startScheduledMessage,
} from '@/features/campaigns/api/campaigns.repository';
import { campaignKeys } from '@/features/campaigns/query-keys';
import type { ScheduledMessage, ScheduledMessageExecutionContext } from '@/features/campaigns/types';

type WeekdayValue = '0' | '1' | '2' | '3' | '4' | '5' | '6';

const WEEKDAY_OPTIONS: Array<{ value: WeekdayValue; label: string }> = [
  { value: '0', label: 'Domingo' },
  { value: '1', label: 'Segunda-feira' },
  { value: '2', label: 'Terca-feira' },
  { value: '3', label: 'Quarta-feira' },
  { value: '4', label: 'Quinta-feira' },
  { value: '5', label: 'Sexta-feira' },
  { value: '6', label: 'Sabado' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pending', label: 'Agendado' },
  { value: 'paused', label: 'Pausado' },
  { value: 'processing', label: 'Executando' },
  { value: 'completed', label: 'Concluido' },
  { value: 'sent', label: 'Enviado' },
  { value: 'failed', label: 'Falhou' },
  { value: 'cancelled', label: 'Cancelado' },
];

const PAGE_SIZE = 20;

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Agendado', variant: 'outline' },
    paused: { label: 'Pausado', variant: 'secondary' },
    processing: { label: 'Executando', variant: 'default' },
    completed: { label: 'Concluido', variant: 'secondary' },
    sent: { label: 'Concluido', variant: 'secondary' },
    failed: { label: 'Falhou', variant: 'destructive' },
    cancelled: { label: 'Cancelado', variant: 'outline' },
  };
  const cfg = map[status] ?? { label: status, variant: 'outline' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function readScheduleMeta(executionContext: ScheduledMessageExecutionContext | undefined) {
  const rawSchedule = executionContext?.schedule;
  if (!rawSchedule || typeof rawSchedule !== 'object' || Array.isArray(rawSchedule)) {
    return null;
  }

  const schedule = rawSchedule as Record<string, unknown>;
  const type = schedule.type;
  if (typeof type !== 'string') return null;

  return {
    type,
    weekday: typeof schedule.weekday === 'number' ? schedule.weekday : undefined,
    monthly_day: typeof schedule.monthly_day === 'number' ? schedule.monthly_day : undefined,
    time: typeof schedule.time === 'string' ? schedule.time : undefined,
    start_date: typeof schedule.start_date === 'string' ? schedule.start_date : undefined,
    end_date: typeof schedule.end_date === 'string' ? schedule.end_date : undefined,
  };
}

function getRoutineDescription(message: ScheduledMessage) {
  const scheduleMeta = readScheduleMeta(message.execution_context);
  if (!scheduleMeta) return 'Data especifica';

  let label: string;

  if (scheduleMeta.type === 'daily') {
    label = 'Rotina diaria';
  } else if (scheduleMeta.type === 'weekly' || scheduleMeta.type === 'biweekly') {
    const dayLabel = WEEKDAY_OPTIONS.find((option) => Number(option.value) === scheduleMeta.weekday)?.label ?? 'dia configurado';
    label = scheduleMeta.type === 'biweekly'
      ? `Rotina quinzenal (${dayLabel})`
      : `Rotina semanal (${dayLabel})`;
  } else if (scheduleMeta.type === 'monthly') {
    label = `Rotina mensal (dia ${scheduleMeta.monthly_day ?? 1})`;
  } else {
    return 'Data especifica';
  }

  if (scheduleMeta.end_date) {
    try {
      const endFormatted = format(parseISO(scheduleMeta.end_date), 'd MMM yyyy', { locale: ptBR });
      label += ` ate ${endFormatted}`;
    } catch {
      // ignore invalid date
    }
  }

  return label;
}

function isPastDate(isoDate: string) {
  const parsed = parseISO(isoDate);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

export function ScheduledMessagesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: campaignKeys.scheduledMessages({ userId: user?.id, status: statusFilter, search, page }),
    queryFn: () => listScheduledMessages({ status: statusFilter, search, page, pageSize: PAGE_SIZE }),
    enabled: !!user,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const messages = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const refreshList = async () => {
    await qc.invalidateQueries({ queryKey: ['automations', 'scheduled-messages'] });
    await qc.refetchQueries({ queryKey: ['automations', 'scheduled-messages'] });
  };

  const pauseMutation = useMutation({
    mutationFn: (id: string) => pauseScheduledMessage(id),
    onSuccess: () => {
      toast.success('Agendamento pausado');
      void refreshList();
    },
    onError: () => toast.error('Erro ao pausar agendamento'),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => startScheduledMessage(id),
    onSuccess: () => {
      toast.success('Agendamento iniciado');
      void refreshList();
    },
    onError: () => toast.error('Erro ao iniciar agendamento'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteScheduledMessage(id),
    onSuccess: () => {
      toast.success('Agendamento apagado');
      setDeleteId(null);
      void refreshList();
    },
    onError: () => toast.error('Erro ao apagar agendamento'),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Agendamentos em massa e rotinas</p>
            <p className="text-xs text-muted-foreground">
              Esta tela apenas cria e gerencia agendamentos futuros. Nao existe disparo manual aqui.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por titulo ou mensagem"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full gap-1.5 sm:w-56">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
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
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center">
          <CalendarClock className="mb-3 h-9 w-9 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhum agendamento cadastrado</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crie rotinas diarias, semanais, quinzenais, mensais ou com data especifica.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((message) => (
            <Card key={message.id} className="border-border/70">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {getStatusBadge(message.status)}
                      <Badge variant="outline">{getRoutineDescription(message)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Primeira execucao: {format(parseISO(message.scheduled_at), "d MMM yyyy 'as' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{message.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{message.message_content}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Canal Moodle</span>
                      {message.recipient_count != null && <span>Destinatarios estimados: {message.recipient_count}</span>}
                      {message.template_id && <span>Com modelo dinamico</span>}
                      <span>Tentativas: {message.execution_attempts}</span>
                    </div>
                    {message.status === 'pending' && message.execution_attempts === 0 && isPastDate(message.scheduled_at) && (
                      <p className="text-xs text-amber-700">
                        Agendamento vencido ainda nao processado. Verifique o executor de agendamentos.
                      </p>
                    )}
                    {message.error_message && (
                      <p className="text-xs text-destructive">Erro: {message.error_message}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {message.status === 'pending' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Pausar"
                        onClick={() => pauseMutation.mutate(message.id)}
                        disabled={pauseMutation.isPending}
                      >
                        <CirclePause className="h-4 w-4" />
                      </Button>
                    )}

                    {message.status === 'paused' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Iniciar"
                        onClick={() => startMutation.mutate(message.id)}
                        disabled={startMutation.isPending}
                      >
                        <CirclePlay className="h-4 w-4" />
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Apagar"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(message.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalCount > 0 && (
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Exibindo {(page - 1) * PAGE_SIZE + 1}-{(page - 1) * PAGE_SIZE + messages.length} de {totalCount}
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
            <span className="text-sm text-muted-foreground">Pagina {page} de {totalPages}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
            >
              Proxima
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!deleteId} onOpenChange={(nextOpen) => !nextOpen && setDeleteId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apagar agendamento?</DialogTitle>
            <DialogDescription>
              Esta acao remove o agendamento de forma permanente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteId(null)}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="gap-1.5"
            >
              {deleteMutation.isPending && <Spinner className="h-4 w-4" />}
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4" />
          <p>
            Use variaveis dinamicas no corpo da mensagem (ex.: {'{nome_aluno}'}, {'{curso}'}) para manter o mesmo comportamento dos modelos usados em campanhas.
          </p>
        </div>
      </div>
    </div>
  );
}
