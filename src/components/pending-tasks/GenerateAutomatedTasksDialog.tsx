import React, { useState } from 'react';
import { 
  AlertTriangle, 
  FileX, 
  ClipboardX, 
  UserX,
  Loader2,
  Zap,
  BookOpen
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface AutomationType {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  source: string;
}

const automationTypes: AutomationType[] = [
  {
    id: 'auto_at_risk',
    label: 'Alunos em Risco',
    description: 'Criar pendências para acompanhar alunos identificados como em risco ou crítico.',
    icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
    source: 'Baseado no nível de risco calculado',
  },
  {
    id: 'auto_missed_assignment',
    label: 'Atividades Não Entregues',
    description: 'Criar pendências para alunos que não entregaram atividades após o prazo.',
    icon: <FileX className="h-5 w-5 text-red-500" />,
    source: 'Atividades com prazo vencido sem submissão',
  },
  {
    id: 'auto_uncorrected_activity',
    label: 'Atividades sem Correção',
    description: 'Criar pendências para atividades submetidas que ainda não foram corrigidas pelo tutor.',
    icon: <ClipboardX className="h-5 w-5 text-orange-500" />,
    source: 'Atividades entregues aguardando correção',
  },
  {
    id: 'auto_no_access',
    label: 'Sem Acesso Recente',
    description: 'Criar pendências para alunos que não acessam o AVA há mais de 7 dias.',
    icon: <UserX className="h-5 w-5 text-purple-500" />,
    source: 'Relatório de acessos do Moodle',
  },
  {
    id: 'auto_low_participation',
    label: 'Baixa Participação em Fóruns',
    description: 'Criar pendências para alunos sem participação nos fóruns de discussão.',
    icon: <BookOpen className="h-5 w-5 text-blue-500" />,
    source: 'Guia do Tutor - Acompanhamento de fóruns',
  },
];

interface GenerateAutomatedTasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function GenerateAutomatedTasksDialog({
  open,
  onOpenChange,
  onSuccess,
}: GenerateAutomatedTasksDialogProps) {
  const { user } = useAuth();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    'auto_at_risk',
    'auto_missed_assignment',
    'auto_uncorrected_activity',
  ]);
  const [isGenerating, setIsGenerating] = useState(false);

  const toggleType = (typeId: string) => {
    setSelectedTypes(prev => 
      prev.includes(typeId) 
        ? prev.filter(t => t !== typeId)
        : [...prev, typeId]
    );
  };

  const handleGenerate = async () => {
    if (!user || selectedTypes.length === 0) return;

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-automated-tasks', {
        body: { automation_types: selectedTypes },
      });

      if (error) throw error;

      const totalCreated = data?.results?.reduce((sum: number, r: any) => sum + r.tasks_created, 0) || 0;
      
      if (totalCreated > 0) {
        const details = data.results
          .filter((r: any) => r.tasks_created > 0)
          .map((r: any) => {
            const type = automationTypes.find(t => t.id === r.type);
            return `${type?.label || r.type}: ${r.tasks_created}`;
          })
          .join(', ');

        toast.success(`${totalCreated} pendências criadas!`, {
          description: details,
        });
        onSuccess?.();
      } else {
        toast.info('Nenhuma nova pendência foi criada', {
          description: 'Todas as pendências automáticas já estão em aberto ou não há situações pendentes.',
        });
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error generating automated tasks:', error);
      toast.error('Erro ao gerar pendências automáticas');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Gerar Pendências Automáticas
          </DialogTitle>
          <DialogDescription>
            Selecione os tipos de pendências que deseja gerar automaticamente com base nos dados dos seus cursos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {automationTypes.map((type) => {
            const isSelected = selectedTypes.includes(type.id);
            return (
              <div
                key={type.id}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                }`}
                onClick={() => toggleType(type.id)}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleType(type.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {type.icon}
                    <Label className="font-medium cursor-pointer">{type.label}</Label>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {type.description}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5 italic">
                    Fonte: {type.source}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || selectedTypes.length === 0}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Gerar {selectedTypes.length > 0 ? `(${selectedTypes.length} tipos)` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}