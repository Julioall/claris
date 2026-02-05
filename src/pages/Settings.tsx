 import { User, RefreshCw, LogOut, Clock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DataCleanupCard } from '@/components/settings/DataCleanupCard';
import { GradeDebugCard } from '@/components/settings/GradeDebugCard';
 import { ActionTypesCard } from '@/components/settings/ActionTypesCard';

export default function Settings() {
  const { user, logout, syncData, lastSync } = useAuth();

  const formatDate = (date: string | null) => {
    if (!date) return 'Nunca';
    return format(new Date(date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie sua conta e preferências
        </p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Perfil
          </CardTitle>
          <CardDescription>
            Informações da sua conta Moodle
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
              {user?.full_name.charAt(0)}
            </div>
            <div>
              <p className="font-medium text-lg">{user?.full_name}</p>
              <p className="text-muted-foreground">{user?.moodle_username}</p>
              {user?.email && (
                <p className="text-sm text-muted-foreground">{user.email}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sincronização
          </CardTitle>
          <CardDescription>
            Status da sincronização com o Moodle
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Última sincronização:</span>
              <span className="font-medium">{formatDate(lastSync)}</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">URL do Moodle:</span>
              <span className="font-medium">https://ead.fieg.com.br</span>
            </div>
          </div>

          <Separator />

          <Button onClick={syncData} variant="outline" className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sincronizar agora
          </Button>
        </CardContent>
      </Card>

      {/* Data Cleanup */}
      <DataCleanupCard />

       {/* Action Types */}
       <ActionTypesCard />
 
      {/* Grade Debug */}
      <GradeDebugCard />

      {/* Logout */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <LogOut className="h-5 w-5" />
            Sair
          </CardTitle>
          <CardDescription>
            Encerrar sessão atual
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={logout} variant="destructive" className="w-full">
            <LogOut className="h-4 w-4 mr-2" />
            Sair da conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
