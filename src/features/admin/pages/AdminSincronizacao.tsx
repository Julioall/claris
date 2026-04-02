import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Check, FolderOpen, RefreshCw } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useMoodleSession } from '@/features/auth/context/MoodleSessionContext';
import { toast } from '@/hooks/use-toast';
import {
  fetchSyncCategoryIds,
  listMoodleCategories,
  saveSyncCategoryIds,
  syncProjectCatalog,
  type CatalogSyncResult,
  type MoodleCategoryApi,
} from '../api/settings';

interface MoodleCategoryNode {
  id: number;
  name: string;
  parent: number;
  children: MoodleCategoryNode[];
}

function buildCategoryTree(categories: MoodleCategoryApi[]): MoodleCategoryNode[] {
  const nodeMap = new Map<number, MoodleCategoryNode>();
  for (const cat of categories) {
    nodeMap.set(cat.id, { id: cat.id, name: cat.name, parent: cat.parent, children: [] });
  }
  const roots: MoodleCategoryNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parent === 0) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(node.parent);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }
  const sortNodes = (nodes: MoodleCategoryNode[]): void => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);
  return roots;
}

function getAllIdsInSubtree(node: MoodleCategoryNode): number[] {
  const ids: number[] = [node.id];
  for (const child of node.children) {
    ids.push(...getAllIdsInSubtree(child));
  }
  return ids;
}

type SelectionState = 'all' | 'partial' | 'none';

function getNodeSelectionState(node: MoodleCategoryNode, selectedIds: Set<number>): SelectionState {
  const allIds = getAllIdsInSubtree(node);
  const selectedCount = allIds.filter((id) => selectedIds.has(id)).length;
  if (selectedCount === 0) return 'none';
  if (selectedCount === allIds.length) return 'all';
  return 'partial';
}

function toggleNodeSelection(node: MoodleCategoryNode, selectedIds: Set<number>): Set<number> {
  const allIds = getAllIdsInSubtree(node);
  const state = getNodeSelectionState(node, selectedIds);
  const next = new Set(selectedIds);
  if (state === 'all') {
    allIds.forEach((id) => next.delete(id));
  } else {
    allIds.forEach((id) => next.add(id));
  }
  return next;
}

function CategoryNodeItem({
  node,
  selectedIds,
  onToggle,
  depth = 0,
}: {
  node: MoodleCategoryNode;
  selectedIds: Set<number>;
  onToggle: (node: MoodleCategoryNode) => void;
  depth?: number;
}) {
  const state = getNodeSelectionState(node, selectedIds);
  const checked: boolean | 'indeterminate' = state === 'all' ? true : state === 'partial' ? 'indeterminate' : false;
  const hasChildren = node.children.length > 0;

  if (!hasChildren) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/40">
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggle(node)}
          aria-label={node.name}
        />
        <span className="text-sm">{node.name}</span>
      </div>
    );
  }

  return (
    <AccordionItem value={String(node.id)} className="border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1 hover:bg-muted/40">
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggle(node)}
          onClick={(e) => e.stopPropagation()}
          aria-label={node.name}
        />
        <AccordionTrigger className="flex-1 py-1 hover:no-underline">
          <div className="flex items-center gap-2">
            {depth === 0 ? (
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="text-sm font-medium">{node.name}</span>
            <span className="text-xs text-muted-foreground font-normal">
              ({node.children.length} subcategoria{node.children.length !== 1 ? 's' : ''})
            </span>
          </div>
        </AccordionTrigger>
      </div>
      <AccordionContent className="px-4 pb-3 pt-1">
        <div className="space-y-1">
          {node.children.map((child) => (
            <CategoryNodeItem
              key={child.id}
              node={child}
              selectedIds={selectedIds}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function AdminSincronizacao() {
  const moodleSession = useMoodleSession();
  const [categoryTree, setCategoryTree] = useState<MoodleCategoryNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<CatalogSyncResult | null>(null);
  const hasAutoLoadedRef = useRef(false);

  useEffect(() => {
    fetchSyncCategoryIds()
      .then((ids) => setSelectedIds(new Set(ids)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!moodleSession || hasAutoLoadedRef.current) return;
    hasAutoLoadedRef.current = true;
    const load = async () => {
      setIsLoadingCategories(true);
      try {
        const result = await listMoodleCategories(moodleSession.moodleUrl, moodleSession.moodleToken);
        setCategoryTree(buildCategoryTree(result.categories));
      } catch {
        // silent fail on auto-load; user can retry manually
      } finally {
        setIsLoadingCategories(false);
      }
    };
    void load();
  }, [moodleSession]);

  const handleReloadCategories = async () => {
    if (!moodleSession) return;
    setIsLoadingCategories(true);
    try {
      const result = await listMoodleCategories(moodleSession.moodleUrl, moodleSession.moodleToken);
      setCategoryTree(buildCategoryTree(result.categories));
    } catch {
      toast({
        title: 'Erro ao carregar categorias',
        description: 'Verifique a conexao com o Moodle e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const handleToggle = useCallback((node: MoodleCategoryNode) => {
    setSelectedIds((prev) => toggleNodeSelection(node, prev));
  }, []);

  const handleSaveSelection = async () => {
    setIsSavingSelection(true);
    try {
      await saveSyncCategoryIds([...selectedIds]);
      toast({ title: 'Selecao salva com sucesso' });
    } catch {
      toast({ title: 'Erro ao salvar selecao', variant: 'destructive' });
    } finally {
      setIsSavingSelection(false);
    }
  };

  const handleSync = async () => {
    if (!moodleSession) return;
    setSyncResult(null);
    setIsSyncing(true);
    try {
      const categoryIds = selectedIds.size > 0 ? [...selectedIds] : undefined;
      const result = await syncProjectCatalog(moodleSession.moodleUrl, moodleSession.moodleToken, categoryIds);
      setSyncResult(result);
      toast({
        title: 'Sincronizacao concluida',
        description: `${result.courses} cursos, ${result.participantUsers} usuarios, ${result.userCourseLinks} vinculos, ${result.groupAssignments} grupos.`,
      });
    } catch (err) {
      toast({
        title: 'Erro na sincronizacao',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sincronizacao</h1>
        <p className="text-muted-foreground">
          Selecione as categorias Moodle e sincronize o catalogo de cursos e participantes.
        </p>
      </div>

      {!moodleSession ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Necessario estar autenticado com credenciais Moodle para usar esta pagina.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Categorias Moodle</CardTitle>
                  <CardDescription>
                    Marque as categorias que deseja sincronizar. Ao selecionar uma categoria pai, todas as subcategorias serao incluidas automaticamente.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReloadCategories}
                  disabled={isLoadingCategories}
                  className="shrink-0"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingCategories ? 'animate-spin' : ''}`} />
                  {isLoadingCategories ? 'Carregando...' : 'Atualizar'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingCategories ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : categoryTree.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma categoria carregada. Clique em &quot;Atualizar&quot; para buscar as categorias do Moodle.
                </p>
              ) : (
                <Accordion type="multiple" className="space-y-2">
                  {categoryTree.map((node) => (
                    <CategoryNodeItem
                      key={node.id}
                      node={node}
                      selectedIds={selectedIds}
                      onToggle={handleToggle}
                      depth={0}
                    />
                  ))}
                </Accordion>
              )}

              {categoryTree.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {selectedIds.size}{' '}
                      {selectedIds.size === 1 ? 'categoria selecionada' : 'categorias selecionadas'}
                      {selectedIds.size === 0 && ' — sincronizara o catalogo inteiro'}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={handleSaveSelection}
                        disabled={isSavingSelection || isSyncing}
                      >
                        {isSavingSelection ? 'Salvando...' : 'Salvar selecao'}
                      </Button>
                      <Button onClick={handleSync} disabled={isSyncing || isSavingSelection}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing
                          ? 'Sincronizando...'
                          : selectedIds.size > 0
                            ? `Sincronizar ${selectedIds.size} ${selectedIds.size === 1 ? 'categoria' : 'categorias'}`
                            : 'Sincronizar tudo'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {syncResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-600" />
                  Resultado da Sincronizacao
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 md:grid-cols-4">
                  {(
                    [
                      { label: 'Cursos', value: syncResult.courses },
                      { label: 'Usuarios', value: syncResult.participantUsers },
                      { label: 'Vinculos', value: syncResult.userCourseLinks },
                      { label: 'Grupos', value: syncResult.groupAssignments },
                    ] as const
                  ).map(({ label, value }) => (
                    <div key={label} className="rounded-md border p-3 text-center">
                      <p className="text-2xl font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
