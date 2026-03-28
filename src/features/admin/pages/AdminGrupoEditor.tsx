import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';

import {
  listAccessGroups,
  listPermissionDefinitions,
  upsertAccessGroup,
  type AdminAccessGroup,
  type AdminPermissionDefinition,
} from '../api/access';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

interface GroupFormState {
  description: string;
  name: string;
  permissionKeys: string[];
}

const EMPTY_GROUP_FORM: GroupFormState = {
  description: '',
  name: '',
  permissionKeys: [],
};

export default function AdminGrupoEditor() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isCreateMode = !groupId;

  const [permissionSearch, setPermissionSearch] = useState('');
  const [form, setForm] = useState<GroupFormState>(EMPTY_GROUP_FORM);

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

  const editingGroup = useMemo(
    () => (groupsQuery.data ?? []).find((group) => group.id === groupId) ?? null,
    [groupId, groupsQuery.data],
  );

  const allPermissions = permissionsQuery.data ?? [];
  const permissionsByCategory = useMemo(() => {
    return allPermissions.reduce<Record<string, AdminPermissionDefinition[]>>((acc, permission) => {
      if (!acc[permission.category]) {
        acc[permission.category] = [];
      }
      acc[permission.category].push(permission);
      return acc;
    }, {});
  }, [allPermissions]);

  const filteredPermissionsByCategory = useMemo(() => {
    const search = permissionSearch.trim().toLowerCase();

    return Object.entries(permissionsByCategory)
      .map(([category, permissions]) => ({
        category,
        permissions: permissions.filter((permission) => {
          if (!search) return true;

          return [
            category,
            permission.label,
            permission.key,
            permission.description ?? '',
          ].some((value) => value.toLowerCase().includes(search));
        }),
      }))
      .filter(({ permissions }) => permissions.length > 0);
  }, [permissionSearch, permissionsByCategory]);

  useEffect(() => {
    setPermissionSearch('');

    if (isCreateMode) {
      setForm(EMPTY_GROUP_FORM);
      return;
    }

    if (editingGroup) {
      setForm({
        name: editingGroup.name,
        description: editingGroup.description ?? '',
        permissionKeys: [...editingGroup.permissions],
      });
    }
  }, [editingGroup, isCreateMode]);

  const saveMutation = useMutation({
    mutationFn: async (payload: GroupFormState & { groupId?: string }) => {
      const { error } = await upsertAccessGroup({
        groupId: payload.groupId,
        name: payload.name,
        description: payload.description,
        permissionKeys: payload.permissionKeys,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-access-groups'] });
      void queryClient.invalidateQueries({ queryKey: ['authorization-context'] });
      toast({ title: isCreateMode ? 'Grupo criado' : 'Grupo atualizado' });
      navigate('/admin/grupos');
    },
    onError: (error) => {
      toast({
        title: 'Erro ao salvar grupo',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const handleTogglePermission = (permissionKey: string) => {
    setForm((current) => ({
      ...current,
      permissionKeys: current.permissionKeys.includes(permissionKey)
        ? current.permissionKeys.filter((key) => key !== permissionKey)
        : [...current.permissionKeys, permissionKey],
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: 'Nome do grupo obrigatorio', variant: 'destructive' });
      return;
    }

    saveMutation.mutate({
      groupId: editingGroup?.id,
      name: form.name.trim(),
      description: form.description.trim(),
      permissionKeys: form.permissionKeys,
    });
  };

  if (!isCreateMode && groupsQuery.isSuccess && !editingGroup) {
    return <Navigate to="/admin/grupos" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/admin">Administracao</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/admin/grupos">Grupos</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{isCreateMode ? 'Novo grupo' : 'Editar grupo'}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Button variant="ghost" size="sm" asChild className="-ml-3 w-fit">
              <Link to="/admin/grupos">
                <ArrowLeft className="h-4 w-4" />
                Voltar para grupos
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {isCreateMode ? 'Novo grupo' : 'Editar grupo'}
              </h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                Organize as capacidades do produto em um grupo reutilizavel. Administradores continuam com acesso total independentemente desse cadastro.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="rounded-full px-3 py-1.5">
              {form.permissionKeys.length} permissoes
            </Badge>
            <Button variant="outline" asChild>
              <Link to="/admin/grupos">Cancelar</Link>
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar grupo'}
            </Button>
          </div>
        </div>
      </div>

      {(permissionsQuery.isLoading || (!isCreateMode && groupsQuery.isLoading)) ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Carregando editor de grupo...
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Identidade do grupo</CardTitle>
              <CardDescription>
                Defina o nome e a descricao antes de ajustar o acesso do grupo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="group-name">Nome</Label>
                <Input
                  id="group-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex: Tutor"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="group-description">Descricao</Label>
                <Textarea
                  id="group-description"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Resumo do objetivo do grupo"
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="gap-4 border-b">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-xl">Catalogo de permissoes</CardTitle>
                  <CardDescription>
                    Selecione o que esse grupo pode acessar. Hoje ha {form.permissionKeys.length} permissao(oes)
                    ativa(s) em {Object.keys(permissionsByCategory).length} categoria(s).
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {form.permissionKeys.length} ativas
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((current) => ({
                      ...current,
                      permissionKeys: allPermissions.map((permission) => permission.key),
                    }))}
                  >
                    Selecionar todas
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((current) => ({ ...current, permissionKeys: [] }))}
                  >
                    Limpar
                  </Button>
                </div>
              </div>

              <div className="relative w-full lg:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={permissionSearch}
                  onChange={(event) => setPermissionSearch(event.target.value)}
                  placeholder="Buscar permissao por nome ou chave"
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="px-6 py-5">
              {filteredPermissionsByCategory.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
                  Nenhuma permissao encontrada para o filtro informado.
                </div>
              ) : (
                <Accordion
                  type="multiple"
                  className="space-y-3"
                >
                  {filteredPermissionsByCategory.map(({ category, permissions }) => {
                    const selectedInCategory = permissions.filter((permission) => form.permissionKeys.includes(permission.key)).length;

                    return (
                      <AccordionItem
                        key={category}
                        value={category}
                        className="overflow-hidden rounded-2xl border bg-muted/[0.18] px-0"
                      >
                        <AccordionTrigger className="px-5 py-4 text-left hover:no-underline">
                          <div className="flex min-w-0 flex-1 items-center justify-between gap-4 pr-3">
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold">{category}</p>
                              <p className="text-sm text-muted-foreground">
                                {selectedInCategory} de {permissions.length} selecionadas
                              </p>
                            </div>
                            <Badge variant="secondary" className="shrink-0">
                              {permissions.length}
                            </Badge>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent className="px-4 pb-4">
                          <div className="space-y-2">
                            {permissions.map((permission) => {
                              const checked = form.permissionKeys.includes(permission.key);

                              return (
                                <label
                                  key={permission.key}
                                  className={`flex cursor-pointer gap-4 rounded-2xl border px-4 py-3 transition-all ${
                                    checked
                                      ? 'border-primary/40 bg-primary/[0.06] shadow-sm'
                                      : 'bg-background hover:border-primary/20 hover:bg-muted/20'
                                  }`}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => handleTogglePermission(permission.key)}
                                    className="mt-1"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                      <div className="space-y-1">
                                        <p className="text-sm font-semibold leading-5">{permission.label}</p>
                                        <p className="font-mono text-xs text-muted-foreground">{permission.key}</p>
                                      </div>
                                      {checked && (
                                        <Badge className="w-fit">Ativa</Badge>
                                      )}
                                    </div>
                                    {permission.description && (
                                      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                                        {permission.description}
                                      </p>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
