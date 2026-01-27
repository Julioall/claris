import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft,
  User,
  BookOpen,
  Clock,
  AlertTriangle,
  Plus,
  Edit,
  CheckCircle2,
  MessageSquare,
  ClipboardList,
  History
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { 
  mockStudents, 
  mockPendingTasks, 
  mockActions, 
  getTasksByStudent,
  getActionsByStudent,
  getRiskLevelLabel
} from '@/lib/mock-data';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const riskReasonLabels: Record<string, string> = {
  atividades_atrasadas: 'Atividades atrasadas',
  baixa_nota: 'Baixa nota',
  sem_acesso_recente: 'Sem acesso recente',
  nao_responde: 'Não responde contato',
};

export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState('pendencias');
  
  // Find student
  const student = mockStudents.find(s => s.id === id);
  
  if (!student) {
    return (
      <div className="text-center py-12">
        <User className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium">Aluno não encontrado</h3>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/alunos">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para lista
          </Link>
        </Button>
      </div>
    );
  }

  const studentTasks = getTasksByStudent(student.id);
  const studentActions = getActionsByStudent(student.id);

  const formatDate = (date: string) => {
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  };

  const formatTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/alunos">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para lista
        </Link>
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
            {student.full_name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{student.full_name}</h1>
            <p className="text-muted-foreground">{student.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <RiskBadge level={student.current_risk_level} size="lg" />
              {student.tags?.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4 mr-2" />
            Editar risco
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova ação
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Último acesso</p>
                <p className="font-medium">{student.last_access ? formatTime(student.last_access) : 'Nunca'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-risk-risco-bg flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-risk-risco" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pendências</p>
                <p className="font-medium">{studentTasks.filter(t => t.status !== 'resolvida').length} abertas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-status-pending-bg flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-status-pending" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ações</p>
                <p className="font-medium">{studentActions.length} registradas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-status-success-bg flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-status-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Última ação</p>
                <p className="font-medium">{student.last_action_date ? formatTime(student.last_action_date) : 'Nunca'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk reasons */}
      {student.risk_reasons && student.risk_reasons.length > 0 && (
        <Card className="border-risk-risco/30 bg-risk-critico-bg/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-risk-risco">
              <AlertTriangle className="h-5 w-5" />
              Motivos do Risco
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {student.risk_reasons.map(reason => (
                <Badge key={reason} variant="outline" className="risk-risco">
                  {riskReasonLabels[reason] || reason}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="pendencias" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Pendências
            {studentTasks.filter(t => t.status !== 'resolvida').length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {studentTasks.filter(t => t.status !== 'resolvida').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="acoes" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Ações
          </TabsTrigger>
          <TabsTrigger value="notas" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Notas
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* Pendências */}
        <TabsContent value="pendencias" className="mt-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Pendências e Atividades</h3>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Criar pendência
            </Button>
          </div>
          
          {studentTasks.length > 0 ? (
            <div className="space-y-2">
              {studentTasks.map(task => (
                <Card key={task.id} className="card-interactive">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{task.title}</p>
                          <Badge variant="outline" className="text-xs">
                            {task.task_type === 'moodle' ? 'Moodle' : 'Interna'}
                          </Badge>
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <StatusBadge status={task.status} size="sm" />
                          <PriorityBadge priority={task.priority} size="sm" />
                          {task.due_date && (
                            <span className="text-xs text-muted-foreground">
                              Prazo: {formatDate(task.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma pendência registrada</p>
            </div>
          )}
        </TabsContent>

        {/* Ações */}
        <TabsContent value="acoes" className="mt-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Ações Realizadas</h3>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Registrar ação
            </Button>
          </div>
          
          {studentActions.length > 0 ? (
            <div className="space-y-2">
              {studentActions.map(action => (
                <Card key={action.id} className="card-interactive">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {action.action_type.replace('_', ' ')}
                          </Badge>
                          <StatusBadge status={action.status} size="sm" />
                        </div>
                        <p className="text-sm mt-2">{action.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTime(action.created_at)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma ação registrada</p>
            </div>
          )}
        </TabsContent>

        {/* Notas */}
        <TabsContent value="notas" className="mt-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-medium">Notas e Observações</h3>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar nota
            </Button>
          </div>
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhuma nota registrada</p>
          </div>
        </TabsContent>

        {/* Histórico */}
        <TabsContent value="historico" className="mt-4">
          <h3 className="font-medium mb-3">Linha do Tempo</h3>
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Histórico em desenvolvimento</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
