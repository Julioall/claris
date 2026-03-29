import { useEffect, useMemo, useState } from 'react';
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
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';

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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { DynamicVariableInput } from '@/features/messages/components/DynamicVariableInput';
import { listMessageTemplateOptionsForUser } from '@/features/messages/api/message-templates.repository';
import type { MessageTemplateOption } from '@/features/messages/types';
import { toast } from 'sonner';

import {
  createScheduledMessage,
  deleteScheduledMessage,
  listScheduledMessages,
  pauseScheduledMessage,
  startScheduledMessage,
  updateScheduledMessage,
} from '@/features/automations/api/automations.repository';
import { automationsKeys } from '@/features/automations/query-keys';
import type {
  ScheduledMessage,
  ScheduledMessageExecutionContext,
  ScheduledMessageFormValues,
} from '@/features/automations/types';

type RoutineType = 'specific_date' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

type WeekdayValue = '0' | '1' | '2' | '3' | '4' | '5' | '6';

interface FormState {
  title: string;
  message_content: string;
  template_id: string;
  scheduleType: RoutineType;
  specificDateTime: string;
  startDate: string;
  timeOfDay: string;
  weekDay: WeekdayValue;
  monthlyDay: string;
  recipient_count?: number;
  notes: string;
}

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
  { value: 'sent', label: 'Concluido' },
  { value: 'failed', label: 'Falhou' },
  { value: 'cancelled', label: 'Cancelado' },
];

const ROUTINE_TYPE_OPTIONS: Array<{ value: RoutineType; label: string }> = [
  { value: 'specific_date', label: 'Data especifica' },
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
];

const PAGE_SIZE = 20;

const EMPTY_FORM: FormState = {
  title: '',
  message_content: '',
  template_id: '',
  scheduleType: 'specific_date',
  specificDateTime: '',
  startDate: '',
  timeOfDay: '',
  weekDay: '1',
  monthlyDay: '1',
  recipient_count: undefined,
  notes: '',
};

function toLocalDateTimeInput(isoDate?: string | null) {
  if (!isoDate) return '';
  const date = parseISO(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function toDateInput(isoDate?: string | null) {
  if (!isoDate) return '';
  const date = parseISO(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'yyyy-MM-dd');
}

function inferWeekday(dateIso?: string | null): WeekdayValue {
  if (!dateIso) return '1';
  const date = parseISO(dateIso);
  if (Number.isNaN(date.getTime())) return '1';
  return String(date.getDay()) as WeekdayValue;
}

function inferMonthlyDay(dateIso?: string | null): string {
  if (!dateIso) return '1';
  const date = parseISO(dateIso);
  if (Number.isNaN(date.getTime())) return '1';
  return String(date.getDate());
}

function combineLocalDateTime(dateValue: string, timeValue: string) {
  return new Date(`${dateValue}T${timeValue}:00`);
}

function computeFirstRun(values: FormState): string {
  if (values.scheduleType === 'specific_date') {
    return values.specificDateTime;
  }

  if (!values.startDate || !values.timeOfDay) {
    return '';
  }

  const base = combineLocalDateTime(values.startDate, values.timeOfDay);

  if (values.scheduleType === 'daily') {
    return format(base, "yyyy-MM-dd'T'HH:mm");
  }

  if (values.scheduleType === 'weekly' || values.scheduleType === 'biweekly') {
    const weekday = Number(values.weekDay);
    const candidate = new Date(base);
    const delta = (weekday - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + delta);
    return format(candidate, "yyyy-MM-dd'T'HH:mm");
  }

  const monthlyDay = Math.max(1, Math.min(31, Number(values.monthlyDay || '1')));
  const candidate = new Date(base);
  candidate.setDate(1);
  const maxDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
  candidate.setDate(Math.min(monthlyDay, maxDay));
  if (candidate < base) {
    candidate.setMonth(candidate.getMonth() + 1);
    const nextMonthMaxDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
    candidate.setDate(Math.min(monthlyDay, nextMonthMaxDay));
  }

  return format(candidate, "yyyy-MM-dd'T'HH:mm");
}

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Agendado', variant: 'outline' },
    paused: { label: 'Pausado', variant: 'secondary' },
    processing: { label: 'Executando', variant: 'default' },
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
  };
}

function getRoutineDescription(message: ScheduledMessage) {
  const scheduleMeta = readScheduleMeta(message.execution_context);
  if (!scheduleMeta) return 'Data especifica';

  if (scheduleMeta.type === 'daily') return 'Rotina diaria';

  if (scheduleMeta.type === 'weekly' || scheduleMeta.type === 'biweekly') {
    const dayLabel = WEEKDAY_OPTIONS.find((option) => Number(option.value) === scheduleMeta.weekday)?.label ?? 'dia configurado';
    return scheduleMeta.type === 'biweekly'
      ? `Rotina quinzenal (${dayLabel})`
      : `Rotina semanal (${dayLabel})`;
  }

  if (scheduleMeta.type === 'monthly') {
    return `Rotina mensal (dia ${scheduleMeta.monthly_day ?? 1})`;
  }

  return 'Data especifica';
}

function isPastDate(isoDate: string) {
  const parsed = parseISO(isoDate);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

function buildExecutionContext(values: FormState): ScheduledMessageExecutionContext {
  const common = {
    schema_version: 2,
    mode: 'bulk_schedule_routine',
    created_via: 'automacoes_page',
    automatic_execution_supported: true,
  } satisfies ScheduledMessageExecutionContext;

  if (values.scheduleType === 'specific_date') {
    return {
      ...common,
      schedule: {
        type: 'specific_date',
      },
    };
  }

  return {
    ...common,
    schedule: {
      type: values.scheduleType,
      start_date: values.startDate,
      time: values.timeOfDay,
      weekday:
        values.scheduleType === 'weekly' || values.scheduleType === 'biweekly'
          ? Number(values.weekDay)
          : undefined,
      monthly_day:
        values.scheduleType === 'monthly'
          ? Number(values.monthlyDay)
          : undefined,
    },
  };
}

function readRecipientSnapshot(
  executionContext: ScheduledMessageExecutionContext | undefined,
) {
  const snapshot = executionContext?.recipient_snapshot;
  return Array.isArray(snapshot) ? snapshot : [];
}

function buildEditingExecutionContext(
  values: FormState,
  editing: ScheduledMessage,
): ScheduledMessageExecutionContext {
  const previous = editing.execution_context;
  const previousMode = previous?.mode;
  const previousSnapshot = readRecipientSnapshot(previous);

  if (previousMode === 'bulk_message_snapshot' && previousSnapshot.length > 0) {
    return {
      ...previous,
      automatic_execution_supported: true,
      blocking_reason: undefined,
      recipient_snapshot: previousSnapshot,
      moodle_url: previous?.moodle_url,
    };
  }

  return buildExecutionContext(values);
}

function toScheduledFormValues(values: FormState): ScheduledMessageFormValues {
  return {
    title: values.title,
    message_content: values.message_content,
    template_id: values.template_id || undefined,
    scheduled_at: computeFirstRun(values),
    recipient_count: values.recipient_count,
    notes: values.notes,
    channel: 'moodle',
    execution_context: buildExecutionContext(values),
  };
}

interface ScheduledMessagesTabProps {
  allowCreate?: boolean;
  allowEdit?: boolean;
}

export function ScheduledMessagesTab({
  allowCreate = true,
  allowEdit = true,
}: ScheduledMessagesTabProps = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const { data: templates = [] } = useQuery({
    queryKey: ['message-templates', 'options', user?.id ?? 'anonymous'],
    queryFn: () => listMessageTemplateOptionsForUser(user!.id),
    enabled: !!user,
  });

  const { data, isLoading } = useQuery({
    queryKey: automationsKeys.scheduledMessages({ userId: user?.id, status: statusFilter, search, page }),
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

  const createMutation = useMutation({
    mutationFn: (values: ScheduledMessageFormValues) => createScheduledMessage(user!.id, values),
    onSuccess: () => {
      toast.success('Agendamento criado');
      closeForm();
      void refreshList();
    },
    onError: () => toast.error('Erro ao criar agendamento'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ScheduledMessageFormValues }) =>
      updateScheduledMessage(id, values),
    onSuccess: () => {
      toast.success('Agendamento atualizado');
      closeForm();
      void refreshList();
    },
    onError: () => toast.error('Erro ao atualizar agendamento'),
  });

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

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (message: ScheduledMessage) => {
    const scheduleMeta = readScheduleMeta(message.execution_context);

    setEditing(message);
    setForm({
      title: message.title,
      message_content: message.message_content,
      template_id: message.template_id ?? '',
      scheduleType:
        scheduleMeta?.type === 'daily' ||
        scheduleMeta?.type === 'weekly' ||
        scheduleMeta?.type === 'biweekly' ||
        scheduleMeta?.type === 'monthly'
          ? scheduleMeta.type
          : 'specific_date',
      specificDateTime: toLocalDateTimeInput(message.scheduled_at),
      startDate: scheduleMeta?.start_date ?? toDateInput(message.scheduled_at),
      timeOfDay: scheduleMeta?.time ?? format(parseISO(message.scheduled_at), 'HH:mm'),
      weekDay:
        typeof scheduleMeta?.weekday === 'number'
          ? (String(scheduleMeta.weekday) as WeekdayValue)
          : inferWeekday(message.scheduled_at),
      monthlyDay:
        typeof scheduleMeta?.monthly_day === 'number'
          ? String(scheduleMeta.monthly_day)
          : inferMonthlyDay(message.scheduled_at),
      recipient_count: message.recipient_count ?? undefined,
      notes: message.notes ?? '',
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.template_id),
    [templates, form.template_id],
  );

  const handleTemplateChange = (templateId: string) => {
    if (templateId === 'none') {
      setForm((prev) => ({ ...prev, template_id: '' }));
      return;
    }

    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    setForm((prev) => ({
      ...prev,
      template_id: template.id,
      message_content: template.content,
      title: prev.title.trim() ? prev.title : template.title,
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.title.trim()) {
      toast.error('Informe um titulo para o agendamento');
      return;
    }

    if (!form.message_content.trim()) {
      toast.error('Informe a mensagem do agendamento');
      return;
    }

    if (form.scheduleType === 'specific_date' && !form.specificDateTime) {
      toast.error('Informe data e horario');
      return;
    }

    if (form.scheduleType !== 'specific_date' && (!form.startDate || !form.timeOfDay)) {
      toast.error('Informe a data inicial e horario da rotina');
      return;
    }

    if ((form.scheduleType === 'weekly' || form.scheduleType === 'biweekly') && form.weekDay == null) {
      toast.error('Selecione o dia da semana');
      return;
    }

    if (form.scheduleType === 'monthly') {
      const day = Number(form.monthlyDay);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        toast.error('Dia do mes invalido');
        return;
      }
    }

    const values = toScheduledFormValues(form);

    if (!values.scheduled_at) {
      toast.error('Nao foi possivel calcular a primeira execucao');
      return;
    }

    if (editing) {
      const editingValues: ScheduledMessageFormValues = {
        ...values,
        execution_context: buildEditingExecutionContext(form, editing),
      };
      updateMutation.mutate({ id: editing.id, values: editingValues });
    } else {
      createMutation.mutate(values);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

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
          {allowCreate && (
            <Button onClick={openCreate} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Novo agendamento
            </Button>
          )}
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
                    {allowEdit && (message.status === 'pending' || message.status === 'paused') && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(message)} title="Editar agendamento">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}

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

      <Dialog
        open={allowCreate || allowEdit ? formOpen : false}
        onOpenChange={(nextOpen) => !nextOpen && closeForm()}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar agendamento' : 'Novo agendamento em massa'}</DialogTitle>
            <DialogDescription>
              Configure a rotina de envio. Esta tela somente registra e gerencia agendamentos.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="schedule-title">Titulo</Label>
                <Input
                  id="schedule-title"
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Ex: Lembrete semanal de atividades"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="schedule-template">Modelo dinamico</Label>
                  <Link to="/campanhas?tab=modelos" className="text-xs text-primary hover:underline">
                    Gerenciar modelos
                  </Link>
                </div>
                <Select value={form.template_id || 'none'} onValueChange={handleTemplateChange}>
                  <SelectTrigger id="schedule-template">
                    <SelectValue placeholder="Selecionar modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem modelo</SelectItem>
                    {templates.map((template: MessageTemplateOption) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplate && (
                  <p className="text-xs text-muted-foreground">
                    Modelo ativo: {selectedTemplate.title}
                  </p>
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Mensagem</Label>
                <DynamicVariableInput
                  value={form.message_content}
                  onChange={(value) => setForm((prev) => ({ ...prev, message_content: value }))}
                  rows={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-type">Tipo de rotina</Label>
                <Select
                  value={form.scheduleType}
                  onValueChange={(value: RoutineType) =>
                    setForm((prev) => ({
                      ...prev,
                      scheduleType: value,
                    }))
                  }
                >
                  <SelectTrigger id="schedule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTINE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.scheduleType === 'specific_date' ? (
                <div className="space-y-2">
                  <Label htmlFor="schedule-datetime">Data e horario</Label>
                  <Input
                    id="schedule-datetime"
                    type="datetime-local"
                    value={form.specificDateTime}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, specificDateTime: event.target.value }))
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="schedule-start-date">Data inicial</Label>
                    <Input
                      id="schedule-start-date"
                      type="date"
                      value={form.startDate}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, startDate: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="schedule-time">Horario</Label>
                    <Input
                      id="schedule-time"
                      type="time"
                      value={form.timeOfDay}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, timeOfDay: event.target.value }))
                      }
                    />
                  </div>
                </>
              )}

              {(form.scheduleType === 'weekly' || form.scheduleType === 'biweekly') && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="schedule-weekday">Dia da semana</Label>
                  <Select
                    value={form.weekDay}
                    onValueChange={(value: WeekdayValue) =>
                      setForm((prev) => ({ ...prev, weekDay: value }))
                    }
                  >
                    <SelectTrigger id="schedule-weekday">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.scheduleType === 'monthly' && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="schedule-monthly-day">Dia do mes</Label>
                  <Input
                    id="schedule-monthly-day"
                    type="number"
                    min={1}
                    max={31}
                    value={form.monthlyDay}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, monthlyDay: event.target.value }))
                    }
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="schedule-recipient-count">Estimativa de destinatarios</Label>
                <Input
                  id="schedule-recipient-count"
                  type="number"
                  min={0}
                  value={form.recipient_count ?? ''}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      recipient_count: event.target.value ? Number(event.target.value) : undefined,
                    }))
                  }
                  placeholder="Opcional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-notes">Observacoes</Label>
                <Input
                  id="schedule-notes"
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              Primeiro agendamento calculado: {computeFirstRun(form) || 'Aguardando configuracao'}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-1.5">
                {isSubmitting && <Spinner className="h-4 w-4" />}
                {editing ? 'Salvar alteracoes' : 'Criar agendamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
