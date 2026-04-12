import { LogOut, MessageSquare, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { MessagePreferencesCard } from '@/features/settings/components/MessagePreferencesCard';
import { MoodleReauthCard } from '@/features/settings/components/MoodleReauthCard';
import { ThemeCard } from '@/features/settings/components/ThemeCard';

export default function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuracoes</h1>
        <p className="text-muted-foreground">Gerencie sua conta e preferencias</p>
      </div>

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="geral" className="gap-2">
            <User className="h-4 w-4" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="mensagens" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Mensagens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-0 space-y-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5" />
                  Perfil
                </CardTitle>
                <CardDescription>Informacoes da sua conta Moodle</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                    {user?.full_name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-lg font-medium">{user?.full_name}</p>
                    <p className="text-muted-foreground">{user?.moodle_username}</p>
                    {user?.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>

            <ThemeCard />
            {user ? <MoodleReauthCard userId={user.id} /> : null}
          </div>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-destructive">
                <LogOut className="h-5 w-5" />
                Sair
              </CardTitle>
              <CardDescription>Encerrar sessao atual</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={logout} variant="destructive" className="w-full">
                <LogOut className="mr-2 h-4 w-4" />
                Sair da conta
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mensagens" className="mt-0 space-y-6">
          <MessagePreferencesCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
