import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  QrCode, Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2,
  Pencil, Trash2, MessageCircle, Plus, Info, Clock
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceInstance {
  id: string;
  name: string;
  description: string | null;
  service_type: string;
  scope: 'personal' | 'shared';
  connection_status: string;
  operational_status: string;
  health_status: string;
  is_active: boolean;
  is_blocked: boolean;
  evolution_instance_name: string | null;
  last_activity_at: string | null;
  last_sync_at: string | null;
  created_at: string;
  owner_user_id: string | null;
}

interface InstanceEvent {
  id: string;
  event_type: string;
  origin: string;
  status: string;
  context: Record<string, unknown>;
  error_summary: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function callInstanceManager(action: string, params: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Não autenticado');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-instance-manager`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...params }),
    }
  );

  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) ?? 'Erro desconhecido');
  return json;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    connected: { label: 'Conectado', variant: 'default' },
    disconnected: { label: 'Desconectado', variant: 'secondary' },
    pending_connection: { label: 'Aguardando conexão', variant: 'outline' },
    draft: { label: 'Rascunho', variant: 'outline' },
    blocked: { label: 'Bloqueado', variant: 'destructive' },
    disabled: { label: 'Desativado', variant: 'secondary' },
    error: { label: 'Erro', variant: 'destructive' },
    cooling_down: { label: 'Resfriando', variant: 'outline' },
    limited: { label: 'Limitado', variant: 'outline' },
  };
  const cfg = map[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function healthIcon(health: string) {
  if (health === 'healthy') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (health === 'warning') return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <AlertTriangle className="h-4 w-4 text-red-500" />;
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    instance_created: 'Instância criada',
    instance_updated: 'Instância atualizada',
    instance_deleted: 'Instância removida',
    connected: 'Conectado',
    disconnected: 'Desconectado',
    send_attempt: 'Tentativa de envio',
    send_success: 'Envio concluído',
    send_failed: 'Envio falhou',
    status_synced: 'Status sincronizado',
    health_checked: 'Saúde verificada',
    webhook_received: 'Webhook recebido',
    cooldown_activated: 'Cooldown ativado',
    auto_paused: 'Pausa automática',
    preventive_blocked: 'Bloqueio preventivo',
    warmup_routine: 'Rotina de aquecimento',
    reprocessed: 'Reprocessado',
  };
  return labels[type] ?? type;
}

// ---------------------------------------------------------------------------
// QR Code Dialog
// ---------------------------------------------------------------------------

function QrCodeDialog({
  instance,
  open,
  onClose,
}: {
  instance: ServiceInstance | null;
  open: boolean;
  onClose: () => void;
}) {
  const [qrData, setQrData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchQr = async () => {
    if (!instance) return;
    setLoading(true);
    try {
      const res = await callInstanceManager('qrcode', { instance_id: instance.id });
      const qr = (res.qrcode as Record<string, unknown>)?.base64 as string
        ?? (res.qrcode as Record<string, unknown>)?.code as string
        ?? null;
      setQrData(qr);
    } catch (err) {
      toast({
        title: 'Erro ao obter QR Code',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-sm text-muted-foreground text-center">
            Abra o WhatsApp no seu celular, vá em <strong>Aparelhos conectados</strong> e
            escaneie o QR Code abaixo.
          </p>
          {qrData ? (
            <img
              src={qrData.startsWith('data:') ? qrData : `data:image/png;base64,${qrData}`}
              alt="QR Code WhatsApp"
              className="w-64 h-64 rounded border"
            />
          ) : (
            <div className="w-64 h-64 rounded border flex items-center justify-center bg-muted">
              <p className="text-sm text-muted-foreground text-center px-4">
                Clique abaixo para gerar o QR Code
              </p>
            </div>
          )}
          <Button onClick={() => void fetchQr()} disabled={loading} className="w-full">
            {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
            {qrData ? 'Atualizar QR Code' : 'Gerar QR Code'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit Name Dialog
// ---------------------------------------------------------------------------

function EditNameDialog({
  instance,
  open,
  onClose,
  onSaved,
}: {
  instance: ServiceInstance | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(instance?.name ?? '');
  const [description, setDescription] = useState(instance?.description ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!instance || !name.trim()) return;
    setSaving(true);
    try {
      await callInstanceManager('update', {
        instance_id: instance.id,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast({ title: 'Nome atualizado' });
      onSaved();
      onClose();
    } catch (err) {
      toast({
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar nome</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Nome</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="WhatsApp Pessoal"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-desc">Descrição</Label>
            <Input
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void handleSave()} disabled={saving || !name.trim()}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function MeusServicos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [qrOpen, setQrOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: myInstance, isLoading } = useQuery({
    queryKey: ['my-whatsapp-instance'],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await (supabase.from as Function)('app_service_instances')
        .select('*')
        .eq('owner_user_id', user.id)
        .eq('service_type', 'whatsapp')
        .eq('scope', 'personal')
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ServiceInstance | null;
    },
    enabled: !!user,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['my-whatsapp-events', myInstance?.id],
    queryFn: async () => {
      if (!myInstance) return [];
      const { data, error } = await supabase
        .from('app_service_instance_events')
        .select('id, event_type, origin, status, context, error_summary, created_at')
        .eq('instance_id', myInstance.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as InstanceEvent[];
    },
    enabled: !!myInstance,
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      callInstanceManager('create', { scope: 'personal', name: 'WhatsApp Pessoal' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-instance'] });
      toast({ title: 'Instância criada! Agora conecte seu WhatsApp.' });
    },
    onError: (err) => {
      toast({
        title: 'Erro ao criar instância',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => callInstanceManager('delete', { instance_id: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-instance'] });
      toast({ title: 'Instância removida' });
    },
    onError: (err) => {
      toast({
        title: 'Erro ao remover',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (id: string) => callInstanceManager('connect', { instance_id: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-instance'] });
      setQrOpen(true);
    },
    onError: (err) => {
      toast({
        title: 'Erro ao iniciar conexão',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => callInstanceManager('deactivate', { instance_id: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-instance'] });
      toast({ title: 'WhatsApp desconectado' });
    },
    onError: (err) => {
      toast({
        title: 'Erro ao desconectar',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (id: string) => callInstanceManager('status', { instance_id: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-instance'] });
      toast({ title: 'Status atualizado' });
    },
    onError: (err) => {
      toast({
        title: 'Erro ao sincronizar',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Carregando...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meus Serviços</h1>
        <p className="text-muted-foreground">
          Gerencie suas integrações pessoais com serviços externos
        </p>
      </div>

      {/* WhatsApp Card */}
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
                <MessageCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">WhatsApp</CardTitle>
                <CardDescription>Instância pessoal para envio de mensagens</CardDescription>
              </div>
              {myInstance && (
                <div className="flex items-center gap-2">
                  {healthIcon(myInstance.health_status)}
                  {statusBadge(myInstance.connection_status)}
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {!myInstance ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
                  <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Nenhuma instância criada</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Crie sua instância pessoal para enviar mensagens WhatsApp diretamente do Claris
                    </p>
                  </div>
                  <Button
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Criar minha instância WhatsApp
                  </Button>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950 p-3">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Você pode ter apenas uma instância pessoal de WhatsApp. Se já existir uma instância
                    compartilhada disponível, utilize-a em vez de criar uma pessoal.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Nome</p>
                    <p className="font-medium flex items-center gap-1">
                      {myInstance.name}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => setEditOpen(true)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status operacional</p>
                    <p className="font-medium capitalize">{myInstance.operational_status}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saúde</p>
                    <div className="flex items-center gap-1">
                      {healthIcon(myInstance.health_status)}
                      <span className="capitalize">{myInstance.health_status}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Última atividade</p>
                    <p>
                      {myInstance.last_activity_at
                        ? format(new Date(myInstance.last_activity_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Criado em</p>
                    <p>{format(new Date(myInstance.created_at), "dd/MM/yyyy", { locale: ptBR })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Última sincronização</p>
                    <p>
                      {myInstance.last_sync_at
                        ? format(new Date(myInstance.last_sync_at), "dd/MM HH:mm", { locale: ptBR })
                        : '—'}
                    </p>
                  </div>
                </div>

                {myInstance.is_blocked && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950 p-3">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-300">
                      Esta instância está bloqueada preventivamente. Entre em contato com o administrador.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>

          {myInstance && (
            <CardFooter className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => statusMutation.mutate(myInstance.id)}
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sincronizar status
              </Button>

              {myInstance.connection_status !== 'connected' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => connectMutation.mutate(myInstance.id)}
                  disabled={connectMutation.isPending || myInstance.is_blocked}
                >
                  <Wifi className="h-4 w-4 mr-2" />
                  Conectar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectMutation.mutate(myInstance.id)}
                  disabled={disconnectMutation.isPending}
                >
                  <WifiOff className="h-4 w-4 mr-2" />
                  Desconectar
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setQrOpen(true)}
                disabled={myInstance.is_blocked}
              >
                <QrCode className="h-4 w-4 mr-2" />
                QR Code
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive ml-auto"
                onClick={() => deleteMutation.mutate(myInstance.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remover instância
              </Button>
            </CardFooter>
          )}
        </Card>

        {/* History */}
        {myInstance && events.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Histórico recente
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-3 px-6 py-3">
                    <div className="mt-0.5">
                      {ev.status === 'success'
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        : ev.status === 'failure'
                        ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{eventLabel(ev.event_type)}</p>
                      {ev.error_summary && (
                        <p className="text-xs text-destructive mt-0.5">{ev.error_summary}</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(ev.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Future services */}
        <Separator />
        <Card className="border-dashed opacity-60">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base text-muted-foreground">Microsoft (em breve)</CardTitle>
                <CardDescription>E-mail, Calendário e Teams pessoais</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Dialogs */}
      <QrCodeDialog
        instance={myInstance ?? null}
        open={qrOpen}
        onClose={() => setQrOpen(false)}
      />

      <EditNameDialog
        instance={myInstance ?? null}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-instance'] })}
      />
    </div>
  );
}
