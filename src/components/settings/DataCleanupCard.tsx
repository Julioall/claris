import { useState } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface CleanupOption {
  id: string;
  label: string;
  description: string;
}

const cleanupOptions: CleanupOption[] = [
  {
    id: 'activities',
    label: 'Atividades dos alunos',
    description: 'Remove todas as atividades e notas sincronizadas',
  },
  {
    id: 'students',
    label: 'Alunos',
    description: 'Remove todos os alunos e suas matrículas',
  },
  {
    id: 'courses',
    label: 'Cursos',
    description: 'Remove todos os cursos e vínculos',
  },
  {
    id: 'pending_tasks',
    label: 'Pendências',
    description: 'Remove todas as pendências criadas',
  },
  {
    id: 'actions',
    label: 'Ações',
    description: 'Remove todas as ações de tutoria',
  },
  {
    id: 'notes',
    label: 'Anotações',
    description: 'Remove todas as anotações sobre alunos',
  },
  {
    id: 'activity_feed',
    label: 'Feed de atividades',
    description: 'Remove o histórico de atividades',
  },
  {
    id: 'risk_history',
    label: 'Histórico de risco',
    description: 'Remove o histórico de níveis de risco',
  },
];

// Helper to delete from specific table with proper typing
async function deleteFromTable(tableId: string): Promise<{ success: boolean; error?: string }> {
  try {
    let error = null;
    
    switch (tableId) {
      case 'activities':
        ({ error } = await supabase.from('student_activities').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
        break;
      case 'students':
        // First delete student_courses
        await supabase.from('student_courses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        ({ error } = await supabase.from('students').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
        break;
      case 'courses':
        // First delete user_courses
        await supabase.from('user_courses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        ({ error } = await supabase.from('courses').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
        break;
      case 'pending_tasks':
        ({ error } = await supabase.from('pending_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
        break;
      case 'actions':
        ({ error } = await supabase.from('actions').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
        break;
      case 'notes':
        ({ error } = await supabase.from('notes').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
        break;
      case 'activity_feed':
        ({ error } = await supabase.from('activity_feed').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
        break;
      case 'risk_history':
        ({ error } = await supabase.from('risk_history').delete().neq('id', '00000000-0000-0000-0000-000000000000'));
        break;
      default:
        return { success: false, error: 'Tabela desconhecida' };
    }
    
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
      // Delete in order: notes, actions, pending_tasks, risk_history, activity_feed, 
      // student_activities, students, courses
      const deleteOrder = [
        'notes',
        'actions', 
        'pending_tasks',
        'risk_history',
        'activity_feed',
        'activities',
        'students',
        'courses',
      ];

      const sortedOptions = [...selectedOptions].sort((a, b) => {
        const indexA = deleteOrder.indexOf(a);
        const indexB = deleteOrder.indexOf(b);
        return indexA - indexB;
      });

      let deletedCount = 0;
      let errors: string[] = [];

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
              Atenção: Esta ação é irreversível. Os dados removidos não poderão ser recuperados.
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

            <div className="grid gap-3">
              {cleanupOptions.map((option) => (
                <div
                  key={option.id}
                  className="flex items-start space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    id={option.id}
                    checked={selectedOptions.includes(option.id)}
                    onCheckedChange={() => toggleOption(option.id)}
                  />
                  <div className="grid gap-0.5 leading-none">
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

          <Button
            onClick={handleCleanup}
            variant="destructive"
            className="w-full"
            disabled={isLoading || selectedOptions.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Limpando...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Limpar dados selecionados ({selectedOptions.length})
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar limpeza de dados
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
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
    </>
  );
}
