import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  GraduationCap,
  History,
  Phone,
  MapPin,
  Mail,
  MessageSquare,
  User,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { StudentGradesTab } from '@/components/student/StudentGradesTab';
import { StudentHistoryTab } from '@/components/student/StudentHistoryTab';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatWindow } from '@/features/claris/components/ChatWindow';

import { useStudentProfile } from '../hooks/useStudentProfile';

function formatTime(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
}

function formatDate(date?: string | null) {
  if (!date) return 'Não informado';

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return 'Não informado';

  return parsedDate.toLocaleString('pt-BR');
}

function resolveMobilePhone(student: {
  mobile_phone?: string | null;
  phone_number?: string | null;
  phone?: string | null;
}) {
  return student.mobile_phone || student.phone_number || student.phone || null;
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
          <Avatar className="h-16 w-16 shrink-0">
            <AvatarImage src={student.avatar_url ?? undefined} alt={student.full_name} />
            <AvatarFallback className="bg-primary/10 text-2xl font-bold text-primary">
              {student.full_name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{student.full_name}</h1>
            <p className="text-muted-foreground">{student.email || 'Email não informado'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RiskBadge level={student.current_risk_level} size="lg" />
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados completos do aluno</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                Nome
              </p>
              <p className="break-all text-sm font-medium">{student.full_name || 'Não informado'}</p>
            </div>

            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                Email
              </p>
              <p className="break-all text-sm font-medium">{student.email || 'Não informado'}</p>
            </div>

            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                Telefone celular
              </p>
              <p className="break-all text-sm font-medium">{resolveMobilePhone(student) || 'Não informado'}</p>
            </div>

            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                Cidade
              </p>
              <p className="break-all text-sm font-medium">{student.city || 'Não informado'}</p>
            </div>

            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                Último acesso
              </p>
              <p className="text-sm font-medium">{formatDate(student.last_access)}</p>
            </div>

            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                Criado em
              </p>
              <p className="text-sm font-medium">{formatDate(student.created_at)}</p>
            </div>

          </div>
        </CardContent>
      </Card>

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
