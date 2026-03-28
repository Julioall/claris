import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Trash2, CalendarClock, AlertCircle, Pencil, MessageCircle, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoodleIcon } from '@/components/ui/MoodleIcon';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  cancelScheduledMessage,
  createScheduledMessage,
  listAccessibleWhatsappInstances,
  listScheduledMessages,
  updateScheduledMessage,
} from '@/features/automations/api/automations.repository';
import { automationsKeys } from '@/features/automations/query-keys';
import type {
  ScheduledMessage,
  ScheduledMessageFormValues,
} from '@/features/automations/types';

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Agendado', variant: 'outline' },
    processing: { label: 'Enviando...', variant: 'default' },
    sent: { label: 'Enviado', variant: 'secondary' },
    failed: { label: 'Falhou', variant: 'destructive' },
    cancelled: { label: 'Cancelado', variant: 'outline' },
  };
  const cfg = map[status] ?? { label: status, variant: 'outline' as const };
  return <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>;
}

function getOriginBadge(origin: string) {
  return (
    <Badge variant="outline" className={`text-xs ${origin === 'ia' ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300' : 'bg-muted/40'}`}>
      {origin === 'ia' ? '✨ Claris IA' : 'Manual'}
    </Badge>
  );
}

const EMPTY_FORM: ScheduledMessageFormValues = {
  title: '',
  message_content: '',
  scheduled_at: '',
  recipient_count: undefined,
  notes: '',
  channel: 'moodle',
  whatsapp_instance_id: undefined,
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pending', label: 'Agendado' },
  { value: 'processing', label: 'Enviando' },
  { value: 'sent', label: 'Enviado' },
  { value: 'failed', label: 'Falhou' },
  { value: 'cancelled', label: 'Cancelado' },
];

const PAGE_SIZE = 20;

export function ScheduledMessagesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);
  const [form, setForm] = useState<ScheduledMessageFormValues>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  // Fetch accessible WhatsApp instances for the current user
  const { data: whatsappInstances = [] } = useQuery({
    queryKey: automationsKeys.accessibleWhatsappInstances(user?.id),
    queryFn: () => listAccessibleWhatsappInstances(user!.id),
    enabled: !!user,
  });

  const { data, isLoading } = useQuery({
    queryKey: automationsKeys.scheduledMessages({ userId: user?.id, status: statusFilter, search, page }),
    queryFn: () => listScheduledMessages({ status: statusFilter, search, page, pageSize: PAGE_SIZE }),
    enabled: !!user,
  });

  const messages = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const createMutation = useMutation({
    mutationFn: (values: ScheduledMessageFormValues) => createScheduledMessage(user!.id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: automationsKeys.scheduledMessages({ userId: user?.id }) });
      toast.success('Agendamento criado');
      closeForm();
    },
    onError: () => toast.error('Erro ao criar agendamento'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ScheduledMessageFormValues }) =>
      updateScheduledMessage(id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: automationsKeys.scheduledMessages({ userId: user?.id }) });
      toast.success('Agendamento atualizado');
      closeForm();
    },
    onError: () => toast.error('Erro ao atualizar agendamento'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelScheduledMessage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: automationsKeys.scheduledMessages({ userId: user?.id }) });
      toast.success('Agendamento cancelado');
      setDeleteId(null);
    },
    onError: () => toast.error('Erro ao cancelar agendamento'),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (msg: ScheduledMessage) => {
    setEditing(msg);
    // format the datetime for the input field (local datetime-local format)
    const localDt = format(parseISO(msg.scheduled_at), "yyyy-MM-dd'T'HH:mm");
    setForm({
      title: msg.title,
      message_content: msg.message_content,
      scheduled_at: localDt,
      recipient_count: msg.recipient_count ?? undefined,
      notes: msg.notes ?? '',
      channel: msg.channel,
      whatsapp_instance_id: msg.whatsapp_instance_id,
    });
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditing(null); setForm(EMPTY_FORM); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message_content.trim() || !form.scheduled_at) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (form.channel === 'whatsapp' && !form.whatsapp_instance_id) {
      toast.error('Selecione uma instância de WhatsApp');
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, values: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground lg:max-w-3xl">
          Programe mensagens em datas específicas. Para agendamentos já com snapshot de destinatários, use o botão "Agendar" na tela de envio em massa.
        </p>
        <Button size="sm" onClick={openCreate} className="gap-1.5 lg:shrink-0">
          <Plus className="h-4 w-4" />
          Novo Agendamento
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título ou mensagem..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-52 gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground border rounded-lg bg-muted/20">
          <CalendarClock className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">Nenhum agendamento</p>
          <p className="text-xs mt-1">Crie um agendamento para disparar mensagens automáticas</p>
          <Button size="sm" variant="outline" onClick={openCreate} className="mt-4 gap-1.5">
            <Plus className="h-4 w-4" />
            Criar Agendamento
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map(msg => (
            <Card key={msg.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {getStatusBadge(msg.status)}
                      {getOriginBadge(msg.origin)}
                      <span className="text-xs text-muted-foreground">
                        <CalendarClock className="h-3 w-3 inline mr-0.5" />
                        {format(parseISO(msg.scheduled_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{msg.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {msg.message_content}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {msg.recipient_count != null && (
                        <span>👥 {msg.recipient_count} destinatários estimados</span>
                      )}
                      {msg.sent_count > 0 && (
                        <span className="text-green-600">✓ {msg.sent_count} enviados</span>
                      )}
                      {msg.failed_count > 0 && (
                        <span className="text-destructive">✗ {msg.failed_count} falhas</span>
                      )}
                    </div>
                    {msg.notes && (
                      <p className="text-xs text-muted-foreground/70 mt-1 italic line-clamp-1">{msg.notes}</p>
                    )}
                  </div>
                  {msg.status === 'pending' && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(msg)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(msg.id)}
                        title="Cancelar agendamento"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalCount > 0 && (
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Exibindo {(page - 1) * PAGE_SIZE + 1}-{(page - 1) * PAGE_SIZE + messages.length} de {totalCount} agendamentos
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

      {/* Form dialog */}
      <Dialog open={formOpen} onOpenChange={v => { if (!v) closeForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Agendamento' : 'Novo Agendamento'}</DialogTitle>
            <DialogDescription>
              Configure a mensagem e o horário de envio.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sched-channel">Canal de envio <span className="text-destructive">*</span></Label>
              <Select
                value={form.channel}
                onValueChange={(v: 'moodle' | 'whatsapp') =>
                  setForm(f => ({ ...f, channel: v, whatsapp_instance_id: undefined }))
                }
              >
                <SelectTrigger id="sched-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="moodle">
                    <div className="flex items-center gap-2">
                      <MoodleIcon className="h-4 w-4 shrink-0" />
                      Moodle
                    </div>
                  </SelectItem>
                  <SelectItem value="whatsapp">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-green-500" />
                      WhatsApp
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.channel === 'whatsapp' && (
              <div className="space-y-2">
                <Label htmlFor="sched-instance">Instância de WhatsApp <span className="text-destructive">*</span></Label>
                {whatsappInstances.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
                    Nenhuma instância de WhatsApp disponível.{' '}
                    <Link to="/meus-servicos" className="underline">Configure em Meus Serviços</Link>.
                  </div>
                ) : (
                  <Select
                    value={form.whatsapp_instance_id ?? ''}
                    onValueChange={(v) => setForm(f => ({ ...f, whatsapp_instance_id: v }))}
                  >
                    <SelectTrigger id="sched-instance">
                      <SelectValue placeholder="Selecione uma instância..." />
                    </SelectTrigger>
                    <SelectContent>
                      {whatsappInstances.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          <div className="flex items-center gap-2">
                            <MessageCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            <span>{inst.name}</span>
                            {inst.scope === 'shared' && (
                              <Badge variant="outline" className="text-xs ml-1">Compartilhada</Badge>
                            )}
                            {inst.connection_status !== 'connected' && (
                              <Badge variant="secondary" className="text-xs ml-1">Desconectada</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="sched-title">Título <span className="text-destructive">*</span></Label>
              <Input
                id="sched-title"
                placeholder="Ex: Boas-vindas de março"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-message">Mensagem <span className="text-destructive">*</span></Label>
              <Textarea
                id="sched-message"
                placeholder="Escreva a mensagem a ser enviada..."
                value={form.message_content}
                onChange={e => setForm(f => ({ ...f, message_content: e.target.value }))}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-at">Data e horário <span className="text-destructive">*</span></Label>
              <Input
                id="sched-at"
                type="datetime-local"
                value={form.scheduled_at}
                onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-count">Estimativa de destinatários</Label>
              <Input
                id="sched-count"
                type="number"
                min={0}
                placeholder="Número estimado de contatos"
                value={form.recipient_count ?? ''}
                onChange={e => setForm(f => ({ ...f, recipient_count: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-notes">Observações</Label>
              <Input
                id="sched-notes"
                placeholder="Contexto ou motivo do envio (opcional)"
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 flex gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Os agendamentos criados nesta aba ainda não carregam um snapshot executável de destinatários.
                Para um job pronto para o novo executor, crie o agendamento a partir da tela de envio em massa.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Spinner className="h-4 w-4 mr-2" /> : null}
                {editing ? 'Salvar' : 'Criar Agendamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O agendamento será marcado como cancelado e não será executado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && cancelMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar Agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
