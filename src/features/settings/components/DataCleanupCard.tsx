import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { cleanupData } from '../api/cleanup';
import {
  CLEANUP_CATEGORY_LABELS,
  CLEANUP_OPTIONS,
  getCleanupOption,
  resolveCleanupTables,
  shouldClearCoursesCache,
  type CleanupOption,
} from '../lib/cleanup-options';

const CLEANUP_OPTIONS_BY_CATEGORY = CLEANUP_OPTIONS.reduce((acc, option) => {
  if (!acc[option.category]) {
    acc[option.category] = [];
  }
  acc[option.category].push(option);
  return acc;
}, {} as Record<CleanupOption['category'], CleanupOption[]>);

const PRESERVED_RESOURCES = [
  'Contas de usuario e acessos administrativos',
  'Grupos, permissoes e credenciais globais da plataforma',
  'Instancias e limites de servicos compartilhados',
];

function formatCleanupErrors(errors: Array<{ table: string; error?: string }> | undefined) {
  if (!errors || errors.length === 0) return null;
  const summarized = errors
    .slice(0, 4)
    .map(({ table, error }) => `${table}: ${error ?? 'erro desconhecido'}`);

  if (errors.length > 4) {
    summarized.push(`+${errors.length - 4} tabela(s) com falha`);
  }

  return summarized.join(', ');
}

export function DataCleanupCard() {
  const { setCourses } = useAuth();
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showFullCleanupDialog, setShowFullCleanupDialog] = useState(false);
  const [isFullCleanupLoading, setIsFullCleanupLoading] = useState(false);

  const toggleOption = (optionId: string) => {
    setSelectedOptions((prev) => (
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    ));
  };

  const selectAll = () => {
    if (selectedOptions.length === CLEANUP_OPTIONS.length) {
      setSelectedOptions([]);
      return;
    }

    setSelectedOptions(CLEANUP_OPTIONS.map((option) => option.id));
  };

  const handleCleanup = async () => {
    if (selectedOptions.length === 0) {
      toast({
        title: 'Nenhuma opcao selecionada',
        description: 'Selecione pelo menos uma categoria para limpar.',
        variant: 'destructive',
      });
      return;
    }

    setShowConfirmDialog(true);
  };

  const executeCleanup = async () => {
    const tables = resolveCleanupTables(selectedOptions);
    if (tables.length === 0) {
      toast({
        title: 'Nenhuma tabela resolvida',
        description: 'Nao foi possivel identificar as tabelas para limpeza.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setShowConfirmDialog(false);

    try {
      const { data, error } = await cleanupData({
        mode: 'selected_cleanup',
        tables,
      });

      if (error) {
        toast({
          title: 'Erro na limpeza',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      if (shouldClearCoursesCache(selectedOptions)) {
        setCourses([]);
      }

      const errorSummary = formatCleanupErrors(data?.errors);
      if (data?.errors?.length) {
        toast({
          title: 'Limpeza parcialmente concluida',
          description: errorSummary ?? `${data.errors.length} tabela(s) falharam durante a limpeza.`,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Limpeza concluida',
        description: `${selectedOptions.length} categoria(s) processadas com sucesso.`,
      });
      setSelectedOptions([]);
    } catch (err) {
      console.error('Cleanup error:', err);
      toast({
        title: 'Erro na limpeza',
        description: 'Ocorreu um erro ao limpar os dados. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const executeFullCleanup = async () => {
    setIsFullCleanupLoading(true);
    setShowFullCleanupDialog(false);

    try {
      const { data, error } = await cleanupData({ mode: 'full_cleanup' });

      if (error) {
        toast({
          title: 'Erro na limpeza completa',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      setCourses([]);

      const errorSummary = formatCleanupErrors(data?.errors);
      if (data?.errors?.length) {
        toast({
          title: 'Limpeza parcialmente concluida',
          description: errorSummary ?? `${data.errors.length} tabela(s) falharam durante a limpeza.`,
          variant: 'destructive',
        });
        return;
      }

      setSelectedOptions([]);
      toast({
        title: 'Base operacional limpa',
        description: 'Os dados operacionais foram removidos. Contas e configuracoes globais foram preservadas.',
      });
    } catch (err) {
      console.error('Full cleanup error:', err);
      toast({
        title: 'Erro na limpeza',
        description: 'Ocorreu um erro ao limpar a base completa.',
        variant: 'destructive',
      });
    } finally {
      setIsFullCleanupLoading(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Limpeza Operacional do Banco
          </CardTitle>
          <CardDescription>
            Acao administrativa para remover dados operacionais e permitir uma retomada limpa da base.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
            <div className="space-y-1 text-sm text-destructive">
              <p>Atencao: esta acao e irreversivel e remove dados para todos os usuarios da plataforma.</p>
              <p>Esta tela deve ser usada apenas por administradores durante manutencoes e resets controlados.</p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">Itens preservados neste fluxo:</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {PRESERVED_RESOURCES.map((resource) => (
                <li key={resource}>{resource}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Selecione o que deseja limpar:</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="text-xs"
              >
                {selectedOptions.length === CLEANUP_OPTIONS.length ? 'Desmarcar tudo' : 'Selecionar tudo'}
              </Button>
            </div>

            <div className="space-y-4">
              {Object.entries(CLEANUP_OPTIONS_BY_CATEGORY).map(([category, options]) => (
                <div key={category} className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground/70">
                    {CLEANUP_CATEGORY_LABELS[category as CleanupOption['category']]}
                  </h3>
                  <div className="ml-2 grid gap-2 border-l-2 border-muted pl-3">
                    {options.map((option) => (
                      <div
                        key={option.id}
                        className="flex items-start space-x-3 rounded-lg p-2 transition-colors hover:bg-accent/30"
                      >
                        <Checkbox
                          id={option.id}
                          checked={selectedOptions.includes(option.id)}
                          onCheckedChange={() => toggleOption(option.id)}
                        />
                        <div className="grid flex-1 gap-0.5 leading-none">
                          <Label
                            htmlFor={option.id}
                            className="cursor-pointer text-sm font-medium"
                          >
                            {option.label}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {option.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleCleanup}
              variant="destructive"
              className="flex-1"
              disabled={isLoading || isFullCleanupLoading || selectedOptions.length === 0}
            >
              {isLoading ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" onAccent />
                  Limpando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar selecionados ({selectedOptions.length})
                </>
              )}
            </Button>
            <Button
              onClick={() => setShowFullCleanupDialog(true)}
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={isLoading || isFullCleanupLoading}
            >
              {isFullCleanupLoading ? <Spinner className="h-4 w-4" /> : 'Limpar tudo'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar limpeza de dados
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Voce esta prestes a remover permanentemente:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {selectedOptions.map((id) => {
                    const option = getCleanupOption(id);
                    return option ? <li key={id}>{option.label}</li> : null;
                  })}
                </ul>
                <p className="font-medium text-destructive">
                  Esta acao nao pode ser desfeita.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeCleanup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, limpar dados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showFullCleanupDialog} onOpenChange={setShowFullCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Limpar toda a base operacional
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Esta acao remove todos os dados operacionais hoje cobertos pelo fluxo de limpeza administrativa.
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Base academica sincronizada, frequencia e snapshots</li>
                  <li>Pendencias, tarefas modernas, agenda e historicos</li>
                  <li>Mensageria, agendamentos e modelos operacionais</li>
                  <li>Claris IA, jobs em segundo plano, suporte e observabilidade</li>
                </ul>
                <p className="font-medium text-destructive">
                  Contas de usuario, acessos admin e configuracoes globais permanecem preservados.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeFullCleanup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, limpar toda a base
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
