 import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  CheckSquare, 
  Search, 
  Filter,
  Plus,
  CheckCircle2,
  Clock,
  ExternalLink,
  Phone,
  MessageSquare,
  Users,
  Wrench,
   Calendar,
   Loader2,
   Pencil,
   Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
 import { NewActionDialog, ActionToEdit } from '@/components/actions/NewActionDialog';
 import { useActionsData } from '@/hooks/useActionsData';
import { ActionType } from '@/types';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
 import { Skeleton } from '@/components/ui/skeleton';
 import { toast } from 'sonner';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';

const actionTypeConfig: Record<ActionType, { label: string; icon: typeof Phone; color: string }> = {
  contato: { label: 'Contato', icon: Phone, color: 'text-blue-500' },
  orientacao: { label: 'Orientação', icon: MessageSquare, color: 'text-purple-500' },
  cobranca: { label: 'Cobrança', icon: Clock, color: 'text-orange-500' },
  suporte_tecnico: { label: 'Suporte Técnico', icon: Wrench, color: 'text-gray-500' },
  reuniao: { label: 'Reunião', icon: Users, color: 'text-green-500' },
  outro: { label: 'Outro', icon: CheckSquare, color: 'text-muted-foreground' },
};

 const defaultIconForType = CheckSquare;
 
 interface ActionTypeOption {
   value: string;
   label: string;
 }
 
export default function Actions() {
   const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isNewActionDialogOpen, setIsNewActionDialogOpen] = useState(false);
   const [actionToEdit, setActionToEdit] = useState<ActionToEdit | null>(null);
   const [actionTypes, setActionTypes] = useState<ActionTypeOption[]>([]);
   
   const { actions, isLoading, refetch, markAsCompleted, deleteAction } = useActionsData();

   // Fetch action types from database
   useEffect(() => {
     const fetchActionTypes = async () => {
       if (!user) return;
       
       try {
         const { data, error } = await supabase
           .from('action_types')
           .select('name, label')
           .eq('user_id', user.id)
           .order('created_at', { ascending: true });
 
         if (error) throw error;
 
         if (data && data.length > 0) {
           setActionTypes(data.map(t => ({ value: t.name, label: t.label })));
         } else {
           setActionTypes(Object.entries(actionTypeConfig).map(([key, config]) => ({
             value: key,
             label: config.label,
           })));
         }
       } catch (err) {
         console.error('Error fetching action types:', err);
       }
     };
 
     fetchActionTypes();
   }, [user]);
 
   const getActionTypeLabel = (typeName: string): string => {
     const customType = actionTypes.find(t => t.value === typeName);
     if (customType) return customType.label;
     const defaultConfig = actionTypeConfig[typeName as ActionType];
     return defaultConfig?.label || typeName;
   };
 
   const getActionTypeConfig = (typeName: string) => {
     const defaultConfig = actionTypeConfig[typeName as ActionType];
     return defaultConfig || { label: typeName, icon: defaultIconForType, color: 'text-muted-foreground' };
   };
 
   const filteredActions = actions.filter(action => {
    const matchesSearch = action.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      action.student?.full_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || action.status === statusFilter;
    const matchesType = typeFilter === 'all' || action.action_type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const formatDate = (date: string) => {
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  };

  const formatTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  };

  const handleActionCreated = () => {
     refetch();
  };
 
   const handleEditAction = (action: ActionToEdit) => {
     setActionToEdit(action);
     setIsNewActionDialogOpen(true);
   };
 
   const handleDialogClose = (open: boolean) => {
     setIsNewActionDialogOpen(open);
     if (!open) {
       setActionToEdit(null);
     }
   };
 
   const handleMarkAsCompleted = async (actionId: string) => {
     const success = await markAsCompleted(actionId);
     if (success) {
       toast.success('Ação marcada como concluída');
     } else {
       toast.error('Erro ao marcar ação como concluída');
     }
   };

   const handleDeleteAction = async (actionId: string) => {
     const success = await deleteAction(actionId);
     if (success) {
       toast.success('Ação excluída');
     } else {
       toast.error('Erro ao excluir ação');
     }
   };
 
   if (isLoading) {
     return (
       <div className="space-y-6 animate-fade-in">
         <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
           <div>
             <Skeleton className="h-8 w-32 mb-2" />
             <Skeleton className="h-4 w-48" />
           </div>
           <Skeleton className="h-10 w-28" />
         </div>
         <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
           <Skeleton className="h-10 flex-1 max-w-md" />
           <div className="flex gap-2">
             <Skeleton className="h-10 w-[140px]" />
             <Skeleton className="h-10 w-[160px]" />
           </div>
         </div>
         <div className="space-y-3">
           {[1, 2, 3].map((i) => (
             <Skeleton key={i} className="h-24 w-full" />
           ))}
         </div>
       </div>
     );
   }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ações</h1>
          <p className="text-muted-foreground">
            {filteredActions.filter(a => a.status === 'planejada').length} ações planejadas
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => setIsNewActionDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova ação
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por descrição ou aluno..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="planejada">Planejada</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
               {actionTypes.map((type) => (
                 <SelectItem key={type.value} value={type.value}>
                   {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Actions list */}
      <div className="space-y-3">
        {filteredActions.map((action) => {
           const config = getActionTypeConfig(action.action_type);
          const Icon = config.icon;
          
          return (
            <Card key={action.id} className="card-interactive">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                    action.status === 'concluida' ? "bg-status-success-bg" : "bg-muted"
                  )}>
                    {action.status === 'concluida' ? (
                      <CheckCircle2 className="h-5 w-5 text-status-success" />
                    ) : (
                      <Icon className={cn("h-5 w-5", config.color)} />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="capitalize">
                         {getActionTypeLabel(action.action_type)}
                      </Badge>
                      <StatusBadge status={action.status} size="sm" />
                    </div>
                    
                    <p className="text-sm mt-2">{action.description}</p>
                    
                    {action.student && (
                      <Link 
                        to={`/alunos/${action.student_id}`}
                        className="text-sm text-primary hover:underline mt-1 inline-block"
                      >
                        {action.student.full_name}
                      </Link>
                    )}
                    
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {action.scheduled_date && action.status === 'planejada' && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Agendada: {formatDate(action.scheduled_date)}
                        </span>
                      )}
                      {action.completed_at && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Concluída: {formatDate(action.completed_at)}
                        </span>
                      )}
                      <span>{formatTime(action.created_at)}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 shrink-0">
                    {action.status === 'planejada' && (
                       <>
                         <Button
                           size="sm"
                           variant="ghost"
                           title="Editar ação"
                           onClick={() => handleEditAction({
                             id: action.id,
                             action_type: action.action_type,
                             description: action.description,
                             student_id: action.student_id,
                             course_id: action.course_id,
                             scheduled_date: action.scheduled_date,
                             student: action.student,
                             course: action.course,
                           })}
                         >
                           <Pencil className="h-4 w-4" />
                         </Button>
                       <Button 
                         size="sm" 
                         variant="ghost" 
                         title="Marcar como concluída"
                         onClick={() => handleMarkAsCompleted(action.id)}
                       >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                       </>
                    )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        title="Excluir ação"
                        onClick={() => handleDeleteAction(action.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/alunos/${action.student_id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredActions.length === 0 && (
        <div className="text-center py-12">
          <CheckSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">Nenhuma ação encontrada</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
              ? 'Tente ajustar os filtros'
              : 'Registre sua primeira ação!'
            }
          </p>
        </div>
      )}

      {/* New Action Dialog */}
      <NewActionDialog
        open={isNewActionDialogOpen}
         onOpenChange={handleDialogClose}
         actionToEdit={actionToEdit}
        onSuccess={handleActionCreated}
      />

    </div>
  );
}
