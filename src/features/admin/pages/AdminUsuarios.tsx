import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Shield, UserCog } from 'lucide-react';

import {
  listAccessGroups,
  searchAdminUsers,
  setUserAccessGroup,
  setUserAdminAccess,
  type AdminAccessGroup,
  type AdminUserAccess,
} from '../api/access';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';

const PAGE_SIZE = 20;
const NO_GROUP_VALUE = '__no_group__';

interface AccessEditorState {
  groupId: string;
  isAdmin: boolean;
}

function AccessSummaryBadge({ user }: { user: AdminUserAccess }) {
  if (user.is_admin) {
    return <Badge>Administrador</Badge>;
  }

  if (user.group_name) {
    return <Badge variant="secondary">{user.group_name}</Badge>;
  }

  return <Badge variant="outline">Sem grupo</Badge>;
}

export default function AdminUsuarios() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<AdminUserAccess | null>(null);
  const [editorState, setEditorState] = useState<AccessEditorState>({ groupId: NO_GROUP_VALUE, isAdmin: false });
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    setPage(1);
  }, [deferredSearch]);

  const usersQuery = useQuery({
    queryKey: ['admin-access-users', deferredSearch, page],
    queryFn: async () => searchAdminUsers({
      query: deferredSearch,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    placeholderData: (previous) => previous,
  });

  const groupsQuery = useQuery({
    queryKey: ['admin-access-groups'],
    queryFn: async () => {
      const { data, error } = await listAccessGroups();
      if (error) throw error;
      return (data ?? []) as AdminAccessGroup[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { userId: string; isAdmin: boolean; groupId: string | null }) => {
      const adminResult = await setUserAdminAccess(payload.userId, payload.isAdmin);
      if (adminResult.error) throw adminResult.error;

      const groupResult = await setUserAccessGroup(payload.userId, payload.isAdmin ? null : payload.groupId);
      if (groupResult.error) throw groupResult.error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-access-users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-access-groups'] });
      void queryClient.invalidateQueries({ queryKey: ['authorization-context'] });
      setSelectedUser(null);
      toast({ title: 'Acesso do usuario atualizado' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar acesso',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const users = usersQuery.data?.users ?? [];
  const totalCount = usersQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const stats = useMemo(() => {
    const adminCount = users.filter((user) => user.is_admin).length;
    const groupedCount = users.filter((user) => !user.is_admin && user.group_id).length;
    return { adminCount, groupedCount };
  }, [users]);

  const openEditor = (user: AdminUserAccess) => {
    setSelectedUser(user);
    setEditorState({
      isAdmin: user.is_admin,
      groupId: user.group_id ?? NO_GROUP_VALUE,
    });
  };

  const handleSave = () => {
    if (!selectedUser) return;

    saveMutation.mutate({
      userId: selectedUser.user_id,
      isAdmin: editorState.isAdmin,
      groupId: editorState.groupId === NO_GROUP_VALUE ? null : editorState.groupId,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuarios e Acessos</h1>
          <p className="text-muted-foreground">
            Busca paginada para gerenciar administradores e grupos de acesso em escala.
          </p>
        </div>

        <div className="flex w-full items-center gap-2 md:max-w-md">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, usuario Moodle ou email"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resultados</CardTitle>
            <CardDescription>Usuarios encontrados para o filtro atual.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{totalCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Admins na pagina</CardTitle>
            <CardDescription>Visao rapida dos administradores no lote exibido.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <p className="text-3xl font-semibold">{stats.adminCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Com grupo na pagina</CardTitle>
            <CardDescription>Usuarios nao admin ja associados a um grupo.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <UserCog className="h-5 w-5 text-primary" />
            <p className="text-3xl font-semibold">{stats.groupedCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios</CardTitle>
          <CardDescription>
            Pagina {page} de {totalPages}. Cada alteracao passa pelas funcoes administrativas do banco.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Moodle</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead className="w-[120px] text-right">Acao</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Carregando usuarios...
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Nenhum usuario encontrado para o filtro informado.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell className="align-top">
                        <div className="font-medium">{user.full_name}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs align-top">{user.moodle_username}</TableCell>
                      <TableCell className="text-sm text-muted-foreground align-top">
                        {user.email || 'Sem email'}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-2">
                          <AccessSummaryBadge user={user} />
                          {!user.is_admin && user.group_slug && (
                            <Badge variant="outline">{user.group_slug}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <Button variant="outline" size="sm" onClick={() => openEditor(user)}>
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Exibindo {(page - 1) * PAGE_SIZE + (users.length > 0 ? 1 : 0)}-
              {(page - 1) * PAGE_SIZE + users.length} de {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1 || usersQuery.isFetching}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || usersQuery.isFetching}
              >
                Proxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar acesso do usuario</DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-5 py-2">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="font-medium">{selectedUser.full_name}</p>
                <p className="font-mono text-xs text-muted-foreground">{selectedUser.moodle_username}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.email || 'Sem email'}</p>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <Label htmlFor="user-is-admin" className="text-sm font-medium">
                    Administrador global
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Admin ve tudo e nao depende de grupo para acessar a aplicacao.
                  </p>
                </div>
                <Switch
                  id="user-is-admin"
                  checked={editorState.isAdmin}
                  onCheckedChange={(checked) => setEditorState((current) => ({ ...current, isAdmin: checked }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-group">Grupo de acesso</Label>
                <Select
                  value={editorState.groupId}
                  onValueChange={(value) => setEditorState((current) => ({ ...current, groupId: value }))}
                  disabled={editorState.isAdmin}
                >
                  <SelectTrigger id="user-group">
                    <SelectValue placeholder="Selecione um grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GROUP_VALUE}>Sem grupo</SelectItem>
                    {(groupsQuery.data ?? []).map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Usuarios sem grupo nao recebem permissoes de produto ate serem associados novamente.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedUser(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
