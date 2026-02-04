import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, BookOpen, Users, ClipboardList, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SyncStep {
  id: string;
  label: string;
  icon: 'courses' | 'students' | 'activities' | 'grades';
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  count?: number;
  total?: number;
  errorMessage?: string;
}

interface SyncProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: SyncStep[];
  currentStep: string | null;
  isComplete: boolean;
  onClose: () => void;
  summary?: {
    courses: number;
    students: number;
    activities: number;
    grades: number;
  };
}

const iconMap = {
  courses: BookOpen,
  students: Users,
  activities: ClipboardList,
  grades: GraduationCap,
};

export function SyncProgressDialog({
  open,
  onOpenChange,
  steps,
  currentStep,
  isComplete,
  onClose,
  summary,
}: SyncProgressDialogProps) {
  const getStepProgress = (step: SyncStep) => {
    if (step.status === 'completed') return 100;
    if (step.status === 'pending') return 0;
    if (step.total && step.count !== undefined) {
      return Math.round((step.count / step.total) * 100);
    }
    return 0;
  };

  const hasErrors = steps.some(s => s.status === 'error');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isComplete ? (
              hasErrors ? (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  Sincronização com erros
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Sincronização concluída
                </>
              )
            ) : (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Sincronizando dados...
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {steps.map((step) => {
            const Icon = iconMap[step.icon];
            const progress = getStepProgress(step);
            
            return (
              <div key={step.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "p-1.5 rounded-md",
                      step.status === 'completed' && "bg-primary/10 text-primary",
                      step.status === 'in_progress' && "bg-primary/10 text-primary",
                      step.status === 'pending' && "bg-muted text-muted-foreground",
                      step.status === 'error' && "bg-destructive/10 text-destructive",
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className={cn(
                      "text-sm font-medium",
                      step.status === 'pending' && "text-muted-foreground"
                    )}>
                      {step.label}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {step.status === 'in_progress' && step.total && (
                      <span className="text-xs text-muted-foreground">
                        {step.count || 0}/{step.total}
                      </span>
                    )}
                    {step.status === 'completed' && step.count !== undefined && (
                      <span className="text-xs font-medium text-primary">
                        {step.count} {step.icon === 'courses' ? 'cursos' : step.icon === 'students' ? 'alunos' : step.icon === 'grades' ? 'notas' : 'atividades'}
                      </span>
                    )}
                    {step.status === 'completed' && (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    )}
                    {step.status === 'in_progress' && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                    {step.status === 'error' && (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                </div>
                
                <Progress 
                  value={progress} 
                  className={cn(
                    "h-1.5",
                    step.status === 'error' && "[&>div]:bg-destructive"
                  )}
                />
                
                {step.status === 'error' && step.errorMessage && (
                  <p className="text-xs text-destructive">{step.errorMessage}</p>
                )}
              </div>
            );
          })}
        </div>

        {isComplete && summary && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-medium">Resumo da sincronização</h4>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold text-primary">{summary.courses}</p>
                <p className="text-xs text-muted-foreground">Cursos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{summary.students}</p>
                <p className="text-xs text-muted-foreground">Alunos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{summary.activities}</p>
                <p className="text-xs text-muted-foreground">Atividades</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{summary.grades}</p>
                <p className="text-xs text-muted-foreground">Notas</p>
              </div>
            </div>
          </div>
        )}

        {isComplete && (
          <div className="flex justify-end pt-2">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
