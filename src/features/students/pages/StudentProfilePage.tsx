import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  GraduationCap,
  History,
  MessageSquare,
  User,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { ChatWindow } from '@/components/chat/ChatWindow';
import { StudentGradesTab } from '@/components/student/StudentGradesTab';
import { StudentHistoryTab } from '@/components/student/StudentHistoryTab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useStudentProfile } from '../hooks/useStudentProfile';

const RISK_REASON_LABELS: Record<string, string> = {
  atividades_atrasadas: 'Atividades atrasadas',
  baixa_nota: 'Baixa nota',
  sem_acesso_recente: 'Sem acesso recente',
  nao_responde: 'Não responde contato',
};

function formatTime(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState('notas');
  const { student, isLoading, error } = useStudentProfile(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="py-12 text-center">
        <User className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-lg font-medium">{error || 'Aluno não encontrado'}</h3>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/alunos">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para lista
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/alunos">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para lista
        </Link>
      </Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
            {student.full_name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{student.full_name}</h1>
            <p className="text-muted-foreground">{student.email || 'Email não informado'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RiskBadge level={student.current_risk_level} size="lg" />
              {student.tags?.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-1">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Último acesso</p>
                <p className="font-medium">{student.last_access ? formatTime(student.last_access) : 'Nunca'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {student.risk_reasons && student.risk_reasons.length > 0 && (
        <Card className="border-risk-risco/30 bg-risk-critico-bg/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-risk-risco">
              <AlertTriangle className="h-5 w-5" />
              Motivos do Risco
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {student.risk_reasons.map((reason) => (
                <Badge key={reason} variant="outline" className="risk-risco">
                  {RISK_REASON_LABELS[reason] || reason}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="notas" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            Notas
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notas" className="mt-4">
          {id && <StudentGradesTab studentId={id} />}
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          {id && <StudentHistoryTab studentId={id} />}
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          {student.moodle_user_id ? (
            <ChatWindow
              moodleUserId={student.moodle_user_id}
              studentName={student.full_name}
              className="h-[500px]"
            />
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>ID do Moodle não encontrado para este aluno</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
