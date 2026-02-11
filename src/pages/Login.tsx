import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Loader2, Eye, EyeOff, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [moodleUrl, setMoodleUrl] = useState('https://ead.fieg.com.br');
  const [serviceName, setServiceName] = useState('moodle_mobile_app');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Preencha todos os campos');
      return;
    }

    const success = await login(username, password, moodleUrl, serviceName);
    if (success) {
      navigate('/');
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/20 p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        {/* Logo and title */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Guia Tutor</h1>
          <p className="text-muted-foreground text-sm">
            Central de Tutoria e Monitoria
          </p>
        </div>

        {/* Login card */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">Entrar</CardTitle>
            <CardDescription>
              Conecte-se ao Moodle para acessar
            </CardDescription>
          </CardHeader>
          <CardContent>
                <form onSubmit={handleCredentialLogin} className="space-y-4">
                  {/* Moodle URL */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="moodleUrl">URL do Moodle</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        {showAdvanced ? 'Ocultar' : 'Avançado'}
                      </Button>
                    </div>
                    <Input
                      id="moodleUrl"
                      type="url"
                      placeholder="https://moodle.exemplo.com"
                      value={moodleUrl}
                      onChange={(e) => setMoodleUrl(e.target.value)}
                      className="bg-muted/50"
                    />
                  </div>

                  {/* Advanced: Service Name */}
                  {showAdvanced && (
                    <div className="space-y-2 animate-fade-in">
                      <Label htmlFor="serviceName">Nome do Serviço Web</Label>
                      <Input
                        id="serviceName"
                        type="text"
                        placeholder="moodle_mobile_app"
                        value={serviceName}
                        onChange={(e) => setServiceName(e.target.value)}
                        className="bg-muted/50"
                      />
                      <p className="text-xs text-muted-foreground">
                        Geralmente é "moodle_mobile_app". Consulte o administrador do Moodle se não funcionar.
                      </p>
                    </div>
                  )}

                  {/* Username */}
                  <div className="space-y-2">
                    <Label htmlFor="username">Usuário</Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="seu.usuario"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      className="bg-muted/50"
                    />
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
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

                  {/* Error message */}
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  {/* Submit button */}
                  <Button 
                    type="submit" 
                    className="w-full" 
                    size="lg"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      'Entrar'
                    )}
                  </Button>
                </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Ao entrar, seus dados são sincronizados do Moodle e salvos de forma segura.
        </p>
      </div>
    </div>
  );
}
