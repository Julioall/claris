import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  connectServiceInstance,
  createPersonalWhatsAppInstance,
  deactivateServiceInstance,
  deleteServiceInstance,
  getMyServiceOverview,
  getServiceInstanceQrCode,
  syncServiceInstanceStatus,
  updateServiceInstance,
  type ServiceInstanceDto,
} from '../api/myServices';
import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundActivityFlag } from '@/contexts/BackgroundActivityContext';
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
  Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2,
  Pencil, Trash2, MessageCircle, Plus, Info, Clock
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type ServiceInstance = ServiceInstanceDto;

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
  const queryClient = useQueryClient();
  const [qrData, setQrData] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const completedRef = useRef(false);
  const instanceId = instance?.id ?? null;
  const instanceConnectionStatus = instance?.connectionStatus ?? null;

  const fetchQr = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    try {
      const res = await getServiceInstanceQrCode(instanceId);
      const qr = res.qrCode;
      const pairing = res.pairingCode;

      setQrData(qr);
      setPairingCode(pairing);

      if (qr) {
        setStatusMessage('QR exibido. Aguardando confirmação da conexão...');
      } else if (pairing) {
        setStatusMessage('Código de pareamento disponível abaixo. Aguardando conexão...');
      } else if (res.message) {
        setStatusMessage(res.message);
      } else {
        setStatusMessage('Nenhum QR Code foi retornado pela Evolution API.');
      }
    } catch (err) {
      setStatusMessage(null);
      toast({
        title: 'Erro ao obter QR Code',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    if (!open || !instanceId) return;

    completedRef.current = false;
    if (instanceConnectionStatus === 'connected') {
      onClose();
      return;
    }
    let disposed = false;
    let closeTimer: number | null = null;

    const pollStatus = async () => {
      if (disposed || completedRef.current) return;

      try {
        const res = await syncServiceInstanceStatus(instanceId, { silent: true });
        if (disposed || completedRef.current) return;

        if (res.connectionStatus === 'connected') {
          completedRef.current = true;
          setStatusMessage('WhatsApp conectado. Fechando...');
          void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-overview'] });
          closeTimer = window.setTimeout(() => {
            if (!disposed) onClose();
          }, 900);
        }
      } catch {
        // Silent polling: manual QR fetch already exposes actionable errors.
      }
    };

    const refreshQr = async () => {
      if (disposed || completedRef.current) return;
      await fetchQr();
    };

    void pollStatus();
    const statusIntervalId = window.setInterval(() => {
      void pollStatus();
    }, 3000);
    const qrIntervalId = window.setInterval(() => {
      void refreshQr();
    }, 15000);

    return () => {
      disposed = true;
      window.clearInterval(statusIntervalId);
      window.clearInterval(qrIntervalId);
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer);
      }
    };
  }, [fetchQr, instanceConnectionStatus, instanceId, onClose, open, queryClient]);

  useEffect(() => {
    if (!open || !instanceId) return;

    completedRef.current = false;
    setQrData(null);
    setPairingCode(null);
    setStatusMessage('Solicitando QR Code...');
    void fetchQr();
  }, [fetchQr, instanceId, open]);

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
          ) : pairingCode ? (
            <div className="w-64 rounded border p-6 text-center space-y-2 bg-muted/30">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Código de pareamento
              </p>
              <p className="font-mono text-3xl font-semibold tracking-[0.3em] pl-[0.3em]">
                {pairingCode}
              </p>
            </div>
          ) : (
            <div className="w-64 h-64 rounded border flex items-center justify-center bg-muted">
              <p className="text-sm text-muted-foreground text-center px-4">
                {statusMessage ?? 'Aguardando QR Code...'}
              </p>
            </div>
          )}
          {(qrData || pairingCode) && statusMessage && (
            <p className="text-xs text-muted-foreground text-center px-4">
              {statusMessage}
            </p>
          )}
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
      await updateServiceInstance({
        instanceId: instance.id,
        name: name.trim(),
        description: description.trim() || null,
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

export default function MyServicesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [qrOpen, setQrOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createPhone, setCreatePhone] = useState('');
  const [createName, setCreateName] = useState('');

  const { data: overview, isLoading } = useQuery({
    queryKey: ['my-whatsapp-overview'],
    queryFn: getMyServiceOverview,
    enabled: !!user,
  });
  const myInstance = overview?.instance ?? null;
  const events = overview?.events ?? [];

  const createMutation = useMutation({
    mutationFn: async ({ phone, name }: { phone: string; name: string }) =>
      createPersonalWhatsAppInstance({
        name: name.trim() || 'WhatsApp Pessoal',
        phoneNumber: phone.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-overview'] });
      setCreateDialogOpen(false);
      setCreatePhone('');
      setCreateName('');
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
    mutationFn: deleteServiceInstance,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-overview'] });
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
    mutationFn: connectServiceInstance,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-overview'] });
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
    mutationFn: deactivateServiceInstance,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-overview'] });
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
    mutationFn: async (id: string) => syncServiceInstanceStatus(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-overview'] });
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

  const handleConnectClick = () => {
    if (!myInstance) return;

    if (myInstance.connectionStatus === 'pending_connection') {
      setQrOpen(true);
      return;
    }

    connectMutation.mutate(myInstance.id);
  };

  const pendingInstanceId = myInstance?.connectionStatus === 'pending_connection'
    ? myInstance.id
    : null;

  useBackgroundActivityFlag({
    id: user?.id ? `whatsapp:pairing:personal:${user.id}` : 'whatsapp:pairing:personal',
    active: connectMutation.isPending || Boolean(pendingInstanceId),
    label: 'Pareando WhatsApp',
    description: 'Aguardando confirmacao da conexao da instancia pessoal.',
    source: 'whatsapp',
  });

  useEffect(() => {
    if (!pendingInstanceId) return;

    let disposed = false;
    const syncStatus = async () => {
      try {
        await syncServiceInstanceStatus(pendingInstanceId, { silent: true });
        if (!disposed) {
          void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-overview'] });
        }
      } catch {
        // Silent background sync while the instance is pairing.
      }
    };

    void syncStatus();
    const intervalId = window.setInterval(() => {
      void syncStatus();
    }, 4000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [pendingInstanceId, queryClient]);

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
                  {healthIcon(myInstance.healthStatus)}
                  {statusBadge(myInstance.connectionStatus)}
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
                    onClick={() => setCreateDialogOpen(true)}
                    disabled={createMutation.isPending}
                  >
                    <Plus className="h-4 w-4 mr-2" />
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
                    <p className="font-medium capitalize">{myInstance.operationalStatus}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saúde</p>
                    <div className="flex items-center gap-1">
                      {healthIcon(myInstance.healthStatus)}
                      <span className="capitalize">{myInstance.healthStatus}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Última atividade</p>
                    <p>
                      {myInstance.lastActivityAt
                        ? format(new Date(myInstance.lastActivityAt), "dd/MM/yyyy HH:mm", { locale: ptBR })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Criado em</p>
                    <p>{format(new Date(myInstance.createdAt), "dd/MM/yyyy", { locale: ptBR })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="font-medium">
                      {myInstance.phoneNumber
                        ? `+${myInstance.phoneNumber}`
                        : <span className="text-muted-foreground">Não informado</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Última sincronização</p>
                    <p>
                      {myInstance.lastSyncAt
                        ? format(new Date(myInstance.lastSyncAt), "dd/MM HH:mm", { locale: ptBR })
                        : '—'}
                    </p>
                  </div>
                </div>

                {myInstance.isBlocked && (
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

              {myInstance.connectionStatus !== 'connected' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConnectClick}
                  disabled={connectMutation.isPending || myInstance.isBlocked}
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
                      <p className="text-sm font-medium">{eventLabel(ev.eventType)}</p>
                      {ev.errorSummary && (
                        <p className="text-xs text-destructive mt-0.5">{ev.errorSummary}</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(ev.createdAt), "dd/MM HH:mm", { locale: ptBR })}
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
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['my-whatsapp-overview'] })}
      />

      {/* Create Instance Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(v) => { if (!createMutation.isPending) setCreateDialogOpen(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar instância WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-phone">Número de telefone <span className="text-destructive">*</span></Label>
              <Input
                id="create-phone"
                type="tel"
                placeholder="+55 11 99999-9999"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                disabled={createMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Informe o número com código do país (ex: +55 11 99999-9999)
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-name">Nome da instância</Label>
              <Input
                id="create-name"
                placeholder="WhatsApp Pessoal"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const digits = createPhone.replace(/\D/g, '');
                if (!digits || digits.length < 10) {
                  toast({ title: 'Informe um número de telefone válido', variant: 'destructive' });
                  return;
                }
                createMutation.mutate({ phone: digits, name: createName });
              }}
              disabled={createMutation.isPending || !createPhone.trim()}
            >
              {createMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Criar instância
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
