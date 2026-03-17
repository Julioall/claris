import { useEffect, useState } from 'react';
import { User, RefreshCw, LogOut, Clock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ThemeCard } from '@/components/settings/ThemeCard';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_MOODLE_SERVICE,
  DEFAULT_MOODLE_URL,
  fetchGlobalAppSettings,
} from '@/lib/global-app-settings';

export default function Settings() {
  const { user, logout, lastSync, syncData, isSyncing, isOfflineMode, courses } = useAuth();
  const [moodleConnectionUrl, setMoodleConnectionUrl] = useState(DEFAULT_MOODLE_URL);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await fetchGlobalAppSettings(supabase);
        setMoodleConnectionUrl(data.moodleConnectionUrl || DEFAULT_MOODLE_URL);
      } catch (error) {
        console.error('Error loading global app settings:', error);
        setMoodleConnectionUrl(DEFAULT_MOODLE_URL);
      }
    };

    loadSettings();
  }, []);

  const formatDate = (date: string | null) => {
    if (!date) return 'Nunca';
    return format(new Date(date), "dd 'de' MMMM 'de' yyyy 'as' HH:mm", { locale: ptBR });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuracoes</h1>
        <p className="text-muted-foreground">Gerencie sua conta e preferencias</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Perfil
            </CardTitle>
            <CardDescription>Informacoes da sua conta Moodle</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                {user?.full_name.charAt(0)}
              </div>
              <div>
                <p className="font-medium text-lg">{user?.full_name}</p>
                <p className="text-muted-foreground">{user?.moodle_username}</p>
                {user?.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <ThemeCard />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sincronizacao
          </CardTitle>
          <CardDescription>Sincronizacao geral para carga inicial da plataforma (quando ainda nao houver dados)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Ultima sincronizacao:</span>
              <span className="font-medium">{formatDate(lastSync)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">URL do Moodle:</span>
              <span className="font-medium">{moodleConnectionUrl}</span>
            </div>
          </div>

          <Separator />

          <div className="rounded-md border p-3 bg-muted/30">
            <p className="text-sm text-muted-foreground">
              Use este botao apenas no inicio, quando ainda nao houver dados sincronizados. Para uso diario, prefira os botoes incrementais nas telas de Alunos e Unidades Curriculares.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={syncData}
            disabled={isOfflineMode || isSyncing || courses.length > 0}
            className="w-full"
          >
            {isSyncing ? 'Sincronizando...' : 'Sincronizacao geral inicial'}
          </Button>

          {courses.length > 0 && (
            <p className="text-xs text-muted-foreground">
              A sincronizacao geral inicial fica disponivel apenas quando ainda nao houver dados na plataforma.
            </p>
          )}

        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <LogOut className="h-5 w-5" />
            Sair
          </CardTitle>
          <CardDescription>Encerrar sessao atual</CardDescription>
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
