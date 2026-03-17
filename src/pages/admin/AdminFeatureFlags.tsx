import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  payload: Record<string, unknown>;
  updated_at: string;
  created_at: string;
}

interface FlagFormState {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  payload: string;
}

const emptyForm: FlagFormState = {
  key: '',
  name: '',
  description: '',
  enabled: false,
  payload: '{}',
};

export default function AdminFeatureFlags() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [form, setForm] = useState<FlagFormState>(emptyForm);
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const { data: flags = [], isLoading } = useQuery({
    queryKey: ['admin-feature-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_feature_flags')
        .select('*')
        .order('key', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FeatureFlag[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FlagFormState) => {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(values.payload) as Record<string, unknown>;
      } catch {
        throw new Error('Payload JSON invalido');
      }

      if (editingFlag) {
        const { error } = await supabase
          .from('app_feature_flags')
          .update({
            name: values.name,
            description: values.description || null,
            enabled: values.enabled,
            payload,
          })
          .eq('id', editingFlag.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('app_feature_flags')
          .insert({
            key: values.key,
            name: values.name,
            description: values.description || null,
            enabled: values.enabled,
            payload,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] });
      toast({ title: editingFlag ? 'Flag atualizada' : 'Flag criada com sucesso' });
      setIsDialogOpen(false);
      setEditingFlag(null);
      setForm(emptyForm);
    },
    onError: (err) => {
      toast({
        title: 'Erro ao salvar flag',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('app_feature_flags')
        .update({ enabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar flag', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('app_feature_flags')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] });
      toast({ title: 'Flag removida' });
    },
    onError: () => {
      toast({ title: 'Erro ao remover flag', variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingFlag(null);
    setForm(emptyForm);
    setPayloadError(null);
    setIsDialogOpen(true);
  };

  const openEdit = (flag: FeatureFlag) => {
    setEditingFlag(flag);
    setForm({
      key: flag.key,
      name: flag.name,
      description: flag.description ?? '',
      enabled: flag.enabled,
      payload: JSON.stringify(flag.payload, null, 2),
    });
    setPayloadError(null);
    setIsDialogOpen(true);
  };

  const handlePayloadChange = (value: string) => {
    setForm((prev) => ({ ...prev, payload: value }));
    try {
      JSON.parse(value);
      setPayloadError(null);
    } catch {
      setPayloadError('JSON invalido');
    }
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: 'Nome obrigatorio', variant: 'destructive' });
      return;
    }
    if (!editingFlag && !form.key.trim()) {
      toast({ title: 'Chave obrigatoria', variant: 'destructive' });
      return;
    }
    if (payloadError) {
      toast({ title: 'Corrija o payload JSON antes de salvar', variant: 'destructive' });
      return;
    }
    saveMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Feature Flags</h1>
          <p className="text-muted-foreground">Gerencie funcionalidades ativas na plataforma</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Flag
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flags configuradas ({flags.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : flags.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Nenhuma feature flag configurada. Clique em &ldquo;Nova Flag&rdquo; para criar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Chave</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descricao</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[160px]">Atualizado</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {flags.map((flag) => (
                  <TableRow key={flag.id}>
                    <TableCell className="font-mono text-xs">{flag.key}</TableCell>
                    <TableCell className="text-sm font-medium">{flag.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{flag.description ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={flag.enabled}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: flag.id, enabled: checked })}
                          disabled={toggleMutation.isPending}
                        />
                        <Badge variant={flag.enabled ? 'default' : 'secondary'}>
                          {flag.enabled ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(flag.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(flag)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(flag.id)}
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingFlag ? 'Editar Feature Flag' : 'Nova Feature Flag'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="flag-key">Chave (identificador unico)</Label>
              <Input
                id="flag-key"
                placeholder="ex: enable_new_dashboard"
                value={form.key}
                onChange={(e) => setForm((p) => ({ ...p, key: e.target.value }))}
                disabled={!!editingFlag}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flag-name">Nome</Label>
              <Input
                id="flag-name"
                placeholder="ex: Novo Dashboard"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flag-description">Descricao</Label>
              <Input
                id="flag-description"
                placeholder="Descricao opcional da funcionalidade"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="flag-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) => setForm((p) => ({ ...p, enabled: checked }))}
              />
              <Label htmlFor="flag-enabled">Flag ativa</Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flag-payload">Payload JSON (dados adicionais)</Label>
              <Textarea
                id="flag-payload"
                value={form.payload}
                onChange={(e) => handlePayloadChange(e.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder="{}"
              />
              {payloadError && (
                <p className="text-xs text-destructive">{payloadError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
