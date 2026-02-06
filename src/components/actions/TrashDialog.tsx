import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { 
  Trash2, 
  RotateCcw, 
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { useActionsData } from '@/hooks/useActionsData';
import { ActionType } from '@/types';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionTypeConfig: Record<ActionType, { label: string; icon: any; color: string }>;
  getActionTypeLabel: (typeName: string) => string;
  getActionTypeConfig: (typeName: string) => { label: string; icon: any; color: string };
}

export function TrashDialog({ 
  open, 
  onOpenChange,
  actionTypeConfig,
  getActionTypeLabel,
  getActionTypeConfig
}: TrashDialogProps) {
  const { actions: trashedActions, isLoading, restoreFromTrash, deletePermanently } = useActionsData(true);
  const [actionToDelete, setActionToDelete] = useState<string | null>(null);

  const handleRestore = async (actionId: string) => {
    const success = await restoreFromTrash(actionId);
    if (success) {
      // Toast will be shown by parent component
    }
  };

  const handleConfirmDelete = async () => {
    if (!actionToDelete) return;
    const success = await deletePermanently(actionToDelete);
    if (success) {
      setActionToDelete(null);
    }
  };

  const getDaysUntilDeletion = (deletedAt: string) => {
    const deletionDate = new Date(deletedAt);
    deletionDate.setDate(deletionDate.getDate() + 90);
    return differenceInDays(deletionDate, new Date());
  };

  const formatDate = (date: string) => {
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  };

  const formatTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Lixeira de Ações
            </DialogTitle>
            <DialogDescription>
              Ações movidas para lixeira são automaticamente excluídas após 90 dias
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : trashedActions.length === 0 ? (
            <div className="text-center py-12">
              <Trash2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Lixeira vazia</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Nenhuma ação na lixeira
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {trashedActions.map((action) => {
                const config = getActionTypeConfig(action.action_type);
                const Icon = config.icon;
                const daysLeft = action.deleted_at ? getDaysUntilDeletion(action.deleted_at) : 0;
                
                return (
                  <Card key={action.id} className="border-destructive/20">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-muted opacity-50"
                        )}>
                          <Icon className={cn("h-5 w-5", config.color)} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="capitalize opacity-70">
                              {getActionTypeLabel(action.action_type)}
                            </Badge>
                            <StatusBadge status={action.status} size="sm" />
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'} restantes
                            </Badge>
                          </div>
                          
                          <p className="text-sm mt-2 opacity-70">{action.description}</p>
                          
                          {action.student && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Aluno: {action.student.full_name}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            {action.deleted_at && (
                              <span className="flex items-center gap-1">
                                <Trash2 className="h-3 w-3" />
                                Excluída: {formatTime(action.deleted_at)}
                              </span>
                            )}
                            {action.scheduled_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Agendada: {formatDate(action.scheduled_date)}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Restaurar"
                            onClick={() => handleRestore(action.id)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            title="Excluir permanentemente"
                            onClick={() => setActionToDelete(action.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!actionToDelete} onOpenChange={(open) => !open && setActionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A ação será permanentemente excluída do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
