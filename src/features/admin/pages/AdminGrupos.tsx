import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  deleteAccessGroup,
  listAccessGroups,
  listPermissionDefinitions,
  type AdminAccessGroup,
  type AdminPermissionDefinition,
} from '../api/access';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';

function summarizePermissions(group: AdminAccessGroup, permissionMap: Map<string, AdminPermissionDefinition>) {
  if (group.permissions.length === 0) return 'Sem permissoes';

  return group.permissions
    .slice(0, 3)
    .map((permissionKey) => permissionMap.get(permissionKey)?.label || permissionKey)
    .join(', ');
}

export default function AdminGrupos() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<AdminAccessGroup | null>(null);
  const [reassignGroupId, setReassignGroupId] = useState('');

  const permissionsQuery = useQuery({
    queryKey: ['admin-permission-definitions'],
    queryFn: async () => {
      const { data, error } = await listPermissionDefinitions();
      if (error) throw error;
      return (data ?? []) as AdminPermissionDefinition[];
    },
  });

  const groupsQuery = useQuery({
    queryKey: ['admin-access-groups'],
    queryFn: async () => {
      const { data, error } = await listAccessGroups();
      if (error) throw error;
      return (data ?? []) as AdminAccessGroup[];
    },
  });

  const permissionMap = useMemo(
    () => new Map((permissionsQuery.data ?? []).map((permission) => [permission.key, permission])),
    [permissionsQuery.data],
  );

  const deleteCandidates = useMemo(() => {
    if (!deleteTarget) return [];
    return (groupsQuery.data ?? []).filter((group) => group.id !== deleteTarget.id);
  }, [deleteTarget, groupsQuery.data]);

  const deleteMutation = useMutation({
    mutationFn: async ({ groupId, reassignmentId }: { groupId: string; reassignmentId?: string | null }) => {
      const { error } = await deleteAccessGroup(groupId, reassignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-access-groups'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-access-users'] });
      void queryClient.invalidateQueries({ queryKey: ['authorization-context'] });
      setDeleteTarget(null);
      setReassignGroupId('');
      toast({ title: 'Grupo removido' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao remover grupo',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const handleDelete = () => {
    if (!deleteTarget) return;

    deleteMutation.mutate({
      groupId: deleteTarget.id,
      reassignmentId: deleteTarget.user_count > 0 ? reassignGroupId || null : null,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Grupos e Permissoes</h1>
          <p className="text-muted-foreground">
            Defina grupos reutilizaveis com permissoes fixas do sistema. Admin continua como override global.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/grupos/novo">
            <Plus className="mr-2 h-4 w-4" />
            Novo grupo
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Grupos ativos</CardTitle>
            <CardDescription>Total de grupos configurados.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{groupsQuery.data?.length ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Permissoes catalogadas</CardTitle>
            <CardDescription>Conjunto fixo de capacidades do produto.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{permissionsQuery.data?.length ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Categorias</CardTitle>
            <CardDescription>Blocos organizados para edicao do acesso.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {new Set((permissionsQuery.data ?? []).map((permission) => permission.category)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grupos configurados</CardTitle>
          <CardDescription>
            A edicao de grupo agora acontece em tela cheia para comportar melhor o catalogo de permissoes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Usuarios</TableHead>
                  <TableHead>Permissoes</TableHead>
                  <TableHead className="w-[120px] text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Carregando grupos...
                    </TableCell>
                  </TableRow>
                ) : (groupsQuery.data?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Nenhum grupo cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  (groupsQuery.data ?? []).map((group) => (
                    <TableRow key={group.id}>
                      <TableCell className="align-top">
                        <div className="font-medium">{group.name}</div>
                        <p className="text-sm text-muted-foreground">{group.description || 'Sem descricao'}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs align-top">{group.slug}</TableCell>
                      <TableCell className="align-top">
                        <Badge variant="secondary">{group.user_count}</Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-2">
                          <p className="text-sm">{summarizePermissions(group, permissionMap)}</p>
                          <p className="text-xs text-muted-foreground">{group.permissions.length} permissoes</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" asChild>
                            <Link to={`/admin/grupos/${group.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setDeleteTarget(group);
                              setReassignGroupId('');
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Remover grupo</DialogTitle>
          </DialogHeader>

          {deleteTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="font-medium">{deleteTarget.name}</p>
                <p className="text-sm text-muted-foreground">
                  {deleteTarget.user_count} usuario(s), {deleteTarget.permissions.length} permissao(oes)
                </p>
              </div>

              {deleteTarget.user_count > 0 ? (
                deleteCandidates.length > 0 ? (
                  <div className="space-y-2">
                    <Label htmlFor="reassign-group">Reatribuir usuarios para</Label>
                    <Select value={reassignGroupId} onValueChange={setReassignGroupId}>
                      <SelectTrigger id="reassign-group">
                        <SelectValue placeholder="Selecione o grupo de destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {deleteCandidates.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      A remocao so pode acontecer depois da reatribuicao dos usuarios atuais.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    Este grupo possui usuarios ativos e nao existe outro grupo disponivel para reatribuicao.
                  </div>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  Este grupo nao possui usuarios associados e pode ser removido imediatamente.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={
                deleteMutation.isPending
                || ((deleteTarget?.user_count ?? 0) > 0 && !reassignGroupId)
                || (deleteCandidates.length === 0 && (deleteTarget?.user_count ?? 0) > 0)
              }
            >
              {deleteMutation.isPending ? 'Removendo...' : 'Remover grupo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
