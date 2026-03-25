import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteAdminUserRole } from '../api/users';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';

interface AdminUserRole {
  id: string;
  user_id: string;
  role: string;
  permissions: string[];
  created_at: string;
}

interface User {
  id: string;
  full_name: string;
  moodle_username: string;
  email: string | null;
}

export default function AdminUsuarios() {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newRole, setNewRole] = useState('admin');

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, moodle_username, email')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as User[];
    },
  });

  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ['admin-user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_user_roles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminUserRole[];
    },
  });

  const grantMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const permissions = role === 'admin'
        ? ['admin', 'support', 'analyst']
        : role === 'support'
          ? ['support']
          : ['analyst'];
      const { error } = await supabase
        .from('admin_user_roles')
        .upsert({ user_id: userId, role, permissions }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      setSelectedUserId('');
      toast({ title: 'Papel atribuido com sucesso' });
    },
    onError: () => {
      toast({ title: 'Erro ao atribuir papel', variant: 'destructive' } as Parameters<typeof toast>[0]);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteAdminUserRole(id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      toast({ title: 'Papel revogado com sucesso' });
    },
  });

  const usersWithRole = roles.map((r) => {
    const user = users.find((u) => u.id === r.user_id);
    return { ...r, user };
  });

  const usersWithoutRole = users.filter((u) => !roles.some((r) => r.user_id === u.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usuarios e Permissoes</h1>
        <p className="text-muted-foreground">Gerencie os papeis administrativos dos usuarios</p>
      </div>

      {/* Grant role */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atribuir papel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="flex-1 min-w-[200px]">
                <SelectValue placeholder="Selecione um usuario" />
              </SelectTrigger>
              <SelectContent>
                {usersWithoutRole.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name} ({u.moodle_username})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Papel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="support">Suporte</SelectItem>
                <SelectItem value="analyst">Analista</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => grantMutation.mutate({ userId: selectedUserId, role: newRole })}
              disabled={!selectedUserId || grantMutation.isPending}
            >
              Atribuir papel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Papeis atribuidos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingUsers || loadingRoles ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : usersWithRole.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum usuario com papel administrativo.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="w-[120px]">Papel</TableHead>
                  <TableHead className="w-[180px]">Permissoes</TableHead>
                  <TableHead className="w-[140px]">Desde</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersWithRole.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      <div>{r.user?.full_name ?? r.user_id}</div>
                      <div className="text-xs text-muted-foreground">{r.user?.moodle_username}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.role === 'admin' ? 'default' : 'secondary'}>{r.role}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {Array.isArray(r.permissions) ? r.permissions.join(', ') : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "dd/MM/yy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeMutation.mutate(r.id)}
                        disabled={revokeMutation.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        Revogar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
