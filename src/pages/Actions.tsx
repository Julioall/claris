import { useState } from 'react';
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
  Calendar
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
import { NewActionDialog } from '@/components/actions/NewActionDialog';
import { mockActions } from '@/lib/mock-data';
import { ActionType } from '@/types';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const actionTypeConfig: Record<ActionType, { label: string; icon: typeof Phone; color: string }> = {
  contato: { label: 'Contato', icon: Phone, color: 'text-blue-500' },
  orientacao: { label: 'Orientação', icon: MessageSquare, color: 'text-purple-500' },
  cobranca: { label: 'Cobrança', icon: Clock, color: 'text-orange-500' },
  suporte_tecnico: { label: 'Suporte Técnico', icon: Wrench, color: 'text-gray-500' },
  reuniao: { label: 'Reunião', icon: Users, color: 'text-green-500' },
  outro: { label: 'Outro', icon: CheckSquare, color: 'text-muted-foreground' },
};

export default function Actions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isNewActionDialogOpen, setIsNewActionDialogOpen] = useState(false);

  const filteredActions = mockActions.filter(action => {
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
    // TODO: Refresh actions list from database
    console.log('Action created successfully');
  };

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

        <Button onClick={() => setIsNewActionDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova ação
        </Button>
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
              {Object.entries(actionTypeConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Actions list */}
      <div className="space-y-3">
        {filteredActions.map((action) => {
          const config = actionTypeConfig[action.action_type];
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
                        {config.label}
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
                      <Button size="sm" variant="ghost" title="Marcar como concluída">
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
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
        onOpenChange={setIsNewActionDialogOpen}
        onSuccess={handleActionCreated}
      />
    </div>
  );
}
