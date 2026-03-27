import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { ClarisLogo } from '@/components/ui/claris-logo';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { fetchLoginDefaults } from '@/features/auth/api/login';
import {
  DEFAULT_MOODLE_SERVICE,
  DEFAULT_MOODLE_URL,
} from '@/lib/global-app-settings';

export default function Login() {
  const BACKGROUND_REAUTH_PREFERENCE_KEY = 'background-reauth-opt-in';
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [backgroundReauthEnabled, setBackgroundReauthEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(BACKGROUND_REAUTH_PREFERENCE_KEY) === 'true';
  });

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Preencha todos os campos');
      return;
    }

    let storedUrl = DEFAULT_MOODLE_URL;
    let storedService = DEFAULT_MOODLE_SERVICE;

    try {
      const loginDefaults = await fetchLoginDefaults();
      storedUrl = loginDefaults.moodleUrl || DEFAULT_MOODLE_URL;
      storedService = loginDefaults.moodleService || DEFAULT_MOODLE_SERVICE;
    } catch (error) {
      console.error('Error loading global Moodle connection settings:', error);
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        BACKGROUND_REAUTH_PREFERENCE_KEY,
        backgroundReauthEnabled ? 'true' : 'false',
      );
    }

    const success = await login(username, password, storedUrl, storedService, {
      backgroundReauthEnabled,
    });
    if (success) {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/20 p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <ClarisLogo className="mx-auto w-60 text-primary" />
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">Entrar</CardTitle>
            <CardDescription>
              Conecte-se ao Moodle para acessar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCredentialLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="bg-muted/50 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                <Checkbox
                  id="background-reauth"
                  checked={backgroundReauthEnabled}
                  onCheckedChange={(checked) => setBackgroundReauthEnabled(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="background-reauth" className="cursor-pointer text-sm">
                    Permitir reautorização automática para jobs em segundo plano
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Quando habilitado, sua credencial do Moodle é cifrada no servidor para que envios e execuções agendadas possam renovar o token sem depender desta aba aberta.
                  </p>
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" onAccent />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Ao entrar, seus dados são sincronizados do Moodle e salvos de forma segura.
        </p>

        <p className="text-center text-[10px] text-muted-foreground/70">
          Copyright (c) 2026 Julio Alves. All rights reserved.
        </p>
      </div>
    </div>
  );
}
