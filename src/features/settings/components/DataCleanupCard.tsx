import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
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
import { cleanupData } from '../api/cleanup';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface CleanupOption {
  id: string;
  label: string;
  description: string;
  category: 'preferences' | 'courses' | 'students' | 'tasks' | 'history';
}

const cleanupOptions: CleanupOption[] = [
  // Preferências do usuário
  {
    id: 'user_sync_preferences',
    label: 'Preferências de sincronização',
    description: 'Remove suas preferências de sincronização com o Moodle',
    category: 'preferences',
  },
  {
    id: 'user_ignored_courses',
    label: 'Cursos ignorados',
    description: 'Remove a lista de cursos que você ignorou',
    category: 'preferences',
  },
  // Registros de cursos
  {
    id: 'student_course_grades',
    label: 'Notas de cursos',
    description: 'Remove todas as notas dos alunos por curso',
    category: 'courses',
  },
  {
    id: 'user_courses',
    label: 'Meus cursos',
    description: 'Remove seus vínculos com os cursos',
    category: 'courses',
  },
  {
    id: 'student_courses',
    label: 'Matrículas de alunos',
    description: 'Remove todas as matrículas dos alunos nos cursos',
    category: 'courses',
  },
  {
    id: 'courses',
    label: 'Cursos',
    description: 'Remove todos os cursos sincronizados',
    category: 'courses',
  },
  // Dados de alunos
  {
    id: 'activities',
    label: 'Atividades dos alunos',
    description: 'Remove todas as atividades e notas sincronizadas',
    category: 'students',
  },
  {
    id: 'students',
    label: 'Alunos',
    description: 'Remove todos os alunos',
    category: 'students',
  },
  // Tarefas e anotações
  {
    id: 'notes',
    label: 'Anotações',
    description: 'Remove todas as anotações sobre alunos',
    category: 'tasks',
  },
  {
    id: 'pending_tasks',
    label: 'Pendências',
    description: 'Remove todas as pendências criadas',
    category: 'tasks',
  },
  // Histórico
  {
    id: 'activity_feed',
    label: 'Feed de atividades',
    description: 'Remove o histórico de atividades',
    category: 'history',
  },
  {
    id: 'risk_history',
    label: 'Histórico de risco',
    description: 'Remove o histórico de níveis de risco dos alunos',
    category: 'history',
  },
];


// Nova função: chama a Edge Function de cleanup
async function deleteFromTable(tableId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await cleanupData();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
  }
}

export function DataCleanupCard() {
  const { setCourses } = useAuth();
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showFullCleanupDialog, setShowFullCleanupDialog] = useState(false);
  const [isFullCleanupLoading, setIsFullCleanupLoading] = useState(false);

  const toggleOption = (optionId: string) => {
    setSelectedOptions(prev =>
      prev.includes(optionId)
        ? prev.filter(id => id !== optionId)
        : [...prev, optionId]
    );
  };

  const selectAll = () => {
    if (selectedOptions.length === cleanupOptions.length) {
      setSelectedOptions([]);
    } else {
      setSelectedOptions(cleanupOptions.map(o => o.id));
    }
  };

  const categoryLabels: Record<string, string> = {
    preferences: 'Preferências do Usuário',
    courses: 'Registros de Cursos',
    students: 'Dados de Alunos',
    tasks: 'Tarefas e Anotações',
    history: 'Histórico',
  };

  const optionsByCategory = cleanupOptions.reduce((acc, option) => {
    if (!acc[option.category]) {
      acc[option.category] = [];
    }
    acc[option.category].push(option);
    return acc;
  }, {} as Record<string, CleanupOption[]>);

  const handleCleanup = async () => {
    if (selectedOptions.length === 0) {
      toast({
        title: "Nenhuma opção selecionada",
        description: "Selecione pelo menos uma opção para limpar.",
        variant: "destructive",
      });
      return;
    }

    setShowConfirmDialog(true);
  };

  const executeCleanup = async () => {
    setIsLoading(true);
    setShowConfirmDialog(false);

    try {
      // Order matters due to foreign key constraints
      // Delete in dependency order: no references → with references
      const deleteOrder = [
        'notes',
        'pending_tasks',
        'risk_history',
        'activity_feed',
        'activities',
        'student_course_grades',
        'student_courses',
        'user_courses',
        'students',
        'courses',
        'user_ignored_courses',
        'user_sync_preferences',
      ];

      const sortedOptions = [...selectedOptions].sort((a, b) => {
        const indexA = deleteOrder.indexOf(a);
        const indexB = deleteOrder.indexOf(b);
        return indexA - indexB;
      });

      let deletedCount = 0;
      const errors: string[] = [];

      for (const optionId of sortedOptions) {
        const option = cleanupOptions.find(o => o.id === optionId);
        if (!option) continue;

        const result = await deleteFromTable(optionId);
        
        if (result.success) {
          deletedCount++;
        } else {
          errors.push(`${option.label}: ${result.error}`);
        }
      }

      // Clear local courses cache if courses were deleted
      if (selectedOptions.includes('courses')) {
        setCourses([]);
      }

      if (errors.length > 0) {
        toast({
          title: "Limpeza parcialmente concluída",
          description: `${deletedCount} categoria(s) removidas. Erros: ${errors.join(', ')}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Limpeza concluída",
          description: `${deletedCount} categoria(s) de dados foram removidas com sucesso.`,
        });
      }

      setSelectedOptions([]);
    } catch (err) {
      console.error('Cleanup error:', err);
      toast({
        title: "Erro na limpeza",
        description: "Ocorreu um erro ao limpar os dados. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const executeFullCleanup = async () => {
    setIsFullCleanupLoading(true);
    setShowFullCleanupDialog(false);

    try {
      const { data, error } = await cleanupData();

      if (error) {
        toast({
          title: "Erro na limpeza completa",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setCourses([]);

      if (data?.errors?.length > 0) {
        toast({
          title: "Limpeza parcialmente concluída",
          description: `${data.cleaned.length} tabelas limpas. ${data.errors.length} erro(s).`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Base completamente limpa",
          description: "Todos os dados foram removidos. Faça uma nova sincronização.",
        });
      }
    } catch (err) {
      console.error('Full cleanup error:', err);
      toast({
        title: "Erro na limpeza",
        description: "Ocorreu um erro ao limpar a base completa.",
        variant: "destructive",
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
            Limpar Dados
          </CardTitle>
          <CardDescription>
            Remova dados do banco para fazer uma sincronização limpa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">
              Atenção: Esta ação é irreversível. Os dados removidos não poderão ser recuperados. Sua conta de usuário será preservada.
            </p>
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
                {selectedOptions.length === cleanupOptions.length ? 'Desmarcar tudo' : 'Selecionar tudo'}
              </Button>
            </div>

            <div className="space-y-4">
              {Object.entries(optionsByCategory).map(([category, options]) => (
                <div key={category} className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground/70">
                    {categoryLabels[category]}
                  </h3>
                  <div className="grid gap-2 ml-2 border-l-2 border-muted pl-3">
                    {options.map((option) => (
                      <div
                        key={option.id}
                        className="flex items-start space-x-3 p-2 rounded-lg hover:bg-accent/30 transition-colors"
                      >
                        <Checkbox
                          id={option.id}
                          checked={selectedOptions.includes(option.id)}
                          onCheckedChange={() => toggleOption(option.id)}
                        />
                        <div className="grid gap-0.5 leading-none flex-1">
                          <Label
                            htmlFor={option.id}
                            className="text-sm font-medium cursor-pointer"
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
              {isFullCleanupLoading ? (
                <Spinner className="h-4 w-4" />
              ) : (
                'Limpar tudo'
              )}
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
              <p>Você está prestes a remover permanentemente:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {selectedOptions.map(id => {
                  const option = cleanupOptions.find(o => o.id === id);
                  return option ? <li key={id}>{option.label}</li> : null;
                })}
              </ul>
              <p className="font-medium text-destructive">
                Esta ação não pode ser desfeita!
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
              Limpar TODA a base de dados
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
              <p>
                Esta ação vai remover <strong>todos os dados</strong> do sistema, incluindo dados que podem ter sido criados por outras sincronizações ou que não estão mais vinculados à sua conta:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Todos os cursos, alunos e matrículas</li>
                <li>Todas as atividades, notas e pendências</li>
                <li>Todas as anotações e mensagens</li>
                <li>Todo o histórico de risco e feed de atividades</li>
                <li>Todas as preferências e modelos</li>
              </ul>
              <p className="font-medium text-destructive">
                Esta ação é irreversível! Sua conta de usuário será preservada.
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
