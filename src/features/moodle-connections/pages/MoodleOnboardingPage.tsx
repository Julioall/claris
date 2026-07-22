import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2 } from 'lucide-react';

import { ClarisLogo } from '@/components/ui/claris-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import {
  createMoodleConnection,
  listMoodleConnections,
  listMoodleSites,
} from '../api/moodle-connections.client';
import type { MoodleConnection, MoodleSiteOption } from '../api/contracts/moodle-connections.contract';
import { saveSelectedMoodleConnectionId } from '../state/selected-connection';

export default function MoodleOnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sites, setSites] = useState<MoodleSiteOption[]>([]);
  const [connections, setConnections] = useState<MoodleConnection[]>([]);
  const [siteId, setSiteId] = useState('');
  const [alias, setAlias] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([listMoodleSites(), listMoodleConnections()])
      .then(([nextSites, nextConnections]) => {
        if (!active) return;
        setSites(nextSites);
        setConnections(nextConnections);
      })
      .catch(() => active && setError('Nao foi possivel carregar os Moodles disponiveis.'))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  const continueWith = (connectionId: string) => {
    if (user?.id) saveSelectedMoodleConnectionId(user.id, connectionId);
    navigate('/meus-cursos', { replace: true });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!siteId || !alias.trim() || !username.trim() || !password) {
      setError('Preencha todos os campos da conexao.');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await createMoodleConnection({
        alias,
        moodlePassword: password,
        moodleUsername: username,
        siteId,
      });
      continueWith(created.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Nao foi possivel validar a conexao Moodle.');
    } finally {
      setPassword('');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <ClarisLogo className="w-52 text-primary" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" />Conectar um Moodle</CardTitle>
            <CardDescription>Sua conta Claris ja esta pronta. Adicione uma conexao agora ou continue sem Moodle.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {connections.length > 0 && (
              <div className="space-y-2">
                <Label>Conexoes existentes</Label>
                {connections.filter((item) => item.status !== 'disabled').map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
                    <div><p className="font-medium">{item.alias}</p><p className="text-xs text-muted-foreground">{item.site.name} · {item.usernameMasked}</p></div>
                    <Button type="button" variant="outline" onClick={() => continueWith(item.id)}>Usar conexao</Button>
                  </div>
                ))}
              </div>
            )}
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label>Site Moodle</Label>
                <Select value={siteId} onValueChange={setSiteId} disabled={isLoading}>
                  <SelectTrigger><SelectValue placeholder="Selecione explicitamente" /></SelectTrigger>
                  <SelectContent>{sites.map((site) => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="connection-alias">Nome da conexao</Label><Input id="connection-alias" value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Ex.: SENAI trabalho" /></div>
              <div className="space-y-2"><Label htmlFor="moodle-username">Usuario Moodle</Label><Input id="moodle-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></div>
              <div className="space-y-2"><Label htmlFor="moodle-password">Senha Moodle</Label><Input id="moodle-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></div>
              <p className="text-xs text-muted-foreground">A credencial valida somente esta conexao. Ela nunca altera seu e-mail, perfil ou senha Claris.</p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => navigate('/', { replace: true })}>Fazer isso depois</Button>
                <Button type="submit" disabled={isLoading || isSubmitting}>{isSubmitting ? 'Validando...' : 'Adicionar conexao'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
