import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { callAdminInstanceManager, listSharedServiceInstances } from '../api/services';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus, Pencil, Trash2, Wifi, WifiOff, Lock, Unlock,
  RefreshCw, AlertTriangle, CheckCircle2, Clock, MessageCircle
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
}

interface InstanceFormState {
  name: string;
  description: string;
  evolution_instance_name: string;
  admin_notes: string;
}

const emptyForm: InstanceFormState = {
  name: '',
  description: '',
  evolution_instance_name: '',
  admin_notes: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    connected: { label: 'Conectado', variant: 'default' },
    disconnected: { label: 'Desconectado', variant: 'secondary' },
    pending_connection: { label: 'Aguardando', variant: 'outline' },
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

async function callInstanceManager(action: string, params: Record<string, unknown> = {}) {
  return callAdminInstanceManager(action, params);
  /*
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
  */
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
  const instanceConnectionStatus = instance?.connection_status ?? null;

  const fetchQr = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    try {
      const res = await callInstanceManager('qrcode', { instance_id: instanceId });
      const payload = ((res.qrcode as Record<string, unknown>) ?? {});
      const qr = (typeof payload.base64 === 'string' && payload.base64)
        || (typeof payload.code === 'string' && payload.code)
        || null;
      const pairing = typeof payload.pairingCode === 'string' && payload.pairingCode
        ? payload.pairingCode
        : null;

      setQrData(qr);
      setPairingCode(pairing);

      if (qr) {
        setStatusMessage('QR exibido. Aguardando confirmação da conexão...');
      } else if (pairing) {
        setStatusMessage('Código de pareamento disponível abaixo. Aguardando conexão...');
      } else if (res.pending === true || payload.count === 0) {
        setStatusMessage(
          'A conexão foi iniciada, mas a Evolution ainda não liberou o QR Code. Aguarde alguns segundos e atualize.'
        );
      } else if (typeof res.message === 'string' && res.message) {
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
        const res = await callInstanceManager('status', { instance_id: instanceId, silent: true });
        if (disposed || completedRef.current) return;

        if (res.connection_status === 'connected') {
          completedRef.current = true;
          setStatusMessage('WhatsApp conectado. Fechando...');
          void queryClient.invalidateQueries({ queryKey: ['admin-service-instances'] });
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
          <DialogTitle>QR Code – {instance?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
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
// Main Page
// ---------------------------------------------------------------------------

export default function AdminServicosAplicacao() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<ServiceInstance | null>(null);
  const [form, setForm] = useState<InstanceFormState>(emptyForm);
  const [qrInstance, setQrInstance] = useState<ServiceInstance | null>(null);

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ['admin-service-instances'],
    queryFn: async () => {
      const { data, error } = await listSharedServiceInstances();
      if (error) throw error;
      return (data ?? []) as ServiceInstance[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: InstanceFormState) => {
      return callInstanceManager('create', {
        scope: 'shared',
        name: values.name,
        description: values.description || undefined,
        evolution_instance_name: values.evolution_instance_name || undefined,
        admin_notes: values.admin_notes || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-service-instances'] });
      toast({ title: 'Instância criada com sucesso' });
      setIsDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err) => {
      toast({
        title: 'Erro ao criar instância',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: InstanceFormState }) => {
      return callInstanceManager('update', {
        instance_id: id,
        name: values.name,
        description: values.description || undefined,
        admin_notes: values.admin_notes || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-service-instances'] });
      toast({ title: 'Instância atualizada' });
      setIsDialogOpen(false);
      setEditingInstance(null);
      setForm(emptyForm);
    },
    onError: (err) => {
      toast({
        title: 'Erro ao atualizar',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => callInstanceManager('delete', { instance_id: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-service-instances'] });
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
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-service-instances'] });
      toast({ title: 'Conexão iniciada' });
      setQrInstance(instances.find((inst) => inst.id === id) ?? null);
    },
    onError: (err) => {
      toast({
        title: 'Erro ao conectar',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => callInstanceManager('deactivate', { instance_id: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-service-instances'] });
      toast({ title: 'Instância desconectada' });
    },
    onError: (err) => {
      toast({
        title: 'Erro ao desconectar',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const blockMutation = useMutation({
    mutationFn: async ({ id, blocked }: { id: string; blocked: boolean }) =>
      callInstanceManager(blocked ? 'block' : 'unblock', { instance_id: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-service-instances'] });
      toast({ title: 'Status atualizado' });
    },
    onError: (err) => {
      toast({
        title: 'Erro',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      callInstanceManager(active ? 'activate' : 'deactivate', { instance_id: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-service-instances'] });
    },
    onError: () => {
      toast({ title: 'Erro ao alterar estado', variant: 'destructive' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (id: string) => callInstanceManager('status', { instance_id: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-service-instances'] });
      toast({ title: 'Status sincronizado' });
    },
    onError: (err) => {
      toast({
        title: 'Erro ao sincronizar status',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const handleConnectClick = (inst: ServiceInstance) => {
    if (inst.connection_status === 'pending_connection') {
      setQrInstance(inst);
      return;
    }

    connectMutation.mutate(inst.id);
  };

  useEffect(() => {
    const pendingInstanceIds = instances
      .filter((inst) => inst.connection_status === 'pending_connection')
      .map((inst) => inst.id);

    if (pendingInstanceIds.length === 0) return;

    let disposed = false;
    const syncStatuses = async () => {
      try {
        await Promise.all(
          pendingInstanceIds.map((id) => callInstanceManager('status', { instance_id: id, silent: true }))
        );
        if (!disposed) {
          void queryClient.invalidateQueries({ queryKey: ['admin-service-instances'] });
        }
      } catch {
        // Silent background sync while one or more instances are pairing.
      }
    };

    void syncStatuses();
    const intervalId = window.setInterval(() => {
      void syncStatuses();
    }, 4000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [instances, queryClient]);

  const openCreate = () => {
    setEditingInstance(null);
    setForm(emptyForm);
    setIsDialogOpen(true);
  };

  const openEdit = (inst: ServiceInstance) => {
    setEditingInstance(inst);
    setForm({
      name: inst.name,
      description: inst.description ?? '',
      evolution_instance_name: inst.evolution_instance_name ?? '',
      admin_notes: '',
    });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    if (editingInstance) {
      updateMutation.mutate({ id: editingInstance.id, values: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Serviços da Aplicação</h1>
          <p className="text-muted-foreground">
            Gerencie integrações externas compartilhadas (WhatsApp, Microsoft e outros)
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Instância Compartilhada
        </Button>
      </div>

      {/* WhatsApp section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
              <MessageCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle className="text-base">WhatsApp</CardTitle>
              <CardDescription>
                Instâncias compartilhadas via Evolution API v2 ({instances.length})
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : instances.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Nenhuma instância compartilhada criada. Clique em &ldquo;Nova Instância&rdquo; para começar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Instância Evolution</TableHead>
                  <TableHead className="w-[130px]">Conexão</TableHead>
                  <TableHead className="w-[80px]">Saúde</TableHead>
                  <TableHead className="w-[80px]">Ativo</TableHead>
                  <TableHead className="w-[140px]">Última Atividade</TableHead>
                  <TableHead className="w-[220px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.map((inst) => (
                  <TableRow key={inst.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{inst.name}</p>
                        {inst.description && (
                          <p className="text-xs text-muted-foreground">{inst.description}</p>
                        )}
                        {inst.is_blocked && (
                          <Badge variant="destructive" className="text-xs mt-1">Bloqueado</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {inst.evolution_instance_name ?? '—'}
                    </TableCell>
                    <TableCell>{statusBadge(inst.connection_status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {healthIcon(inst.health_status)}
                        <span className="text-xs text-muted-foreground capitalize">{inst.health_status}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={inst.is_active}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: inst.id, active: checked })
                        }
                        disabled={toggleActiveMutation.isPending}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {inst.last_activity_at
                        ? format(new Date(inst.last_activity_at), "dd/MM HH:mm", { locale: ptBR })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Sincronizar status"
                          onClick={() => statusMutation.mutate(inst.id)}
                          disabled={statusMutation.isPending}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        {inst.connection_status === 'connected' ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Desconectar"
                            onClick={() => deactivateMutation.mutate(inst.id)}
                            disabled={deactivateMutation.isPending}
                          >
                            <WifiOff className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Conectar"
                            onClick={() => handleConnectClick(inst)}
                            disabled={connectMutation.isPending}
                          >
                            <Wifi className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title={inst.is_blocked ? 'Desbloquear' : 'Bloquear preventivamente'}
                          onClick={() => blockMutation.mutate({ id: inst.id, blocked: !inst.is_blocked })}
                          disabled={blockMutation.isPending}
                        >
                          {inst.is_blocked ? (
                            <Unlock className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Lock className="h-3.5 w-3.5 text-yellow-500" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Editar"
                          onClick={() => openEdit(inst)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Remover"
                          onClick={() => deleteMutation.mutate(inst.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Future services placeholder */}
      <Card className="border-dashed opacity-60">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base text-muted-foreground">Microsoft (em breve)</CardTitle>
              <CardDescription>E-mail, Calendário e Teams</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingInstance ? 'Editar Instância' : 'Nova Instância Compartilhada'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="inst-name">Nome da instância *</Label>
              <Input
                id="inst-name"
                placeholder="ex: WhatsApp Secretaria"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-description">Descrição</Label>
              <Input
                id="inst-description"
                placeholder="Descrição opcional"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            {!editingInstance && (
              <div className="space-y-1.5">
                <Label htmlFor="inst-evolution-name">Nome na Evolution API</Label>
                <Input
                  id="inst-evolution-name"
                  placeholder="ex: claris-secretaria (gerado automaticamente se vazio)"
                  value={form.evolution_instance_name}
                  onChange={(e) => setForm((p) => ({ ...p, evolution_instance_name: e.target.value }))}
                  className="font-mono"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="inst-notes">Observações administrativas</Label>
              <Textarea
                id="inst-notes"
                placeholder="Notas internas sobre esta instância"
                value={form.admin_notes}
                onChange={(e) => setForm((p) => ({ ...p, admin_notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <QrCodeDialog
        instance={qrInstance}
        open={!!qrInstance}
        onClose={() => setQrInstance(null)}
      />
    </div>
  );
}
