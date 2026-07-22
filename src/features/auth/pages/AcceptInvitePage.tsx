import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authGateway } from '@/integrations/auth/auth-gateway';
import { provisionClarisAccount } from '../api/claris-account';
import { AuthShell } from './AuthShell';

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    void (code ? authGateway.exchangeCodeForSession(code) : authGateway.getSession())
      .then((session) => {
        if (!session) setError('Este convite e invalido, expirou ou ja foi utilizado.');
      })
      .catch(() => setError('Este convite e invalido, expirou ou ja foi utilizado.'))
      .finally(() => setIsPreparing(false));
  }, [searchParams]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 12) {
      setError('A senha deve ter ao menos 12 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('As senhas nao conferem.');
      return;
    }
    setIsSubmitting(true);
    try {
      await authGateway.updatePassword(password);
      const provisioned = await provisionClarisAccount();
      navigate(provisioned.nextPath, { replace: true });
    } catch {
      setError('Nao foi possivel concluir o convite. Solicite um novo link ao administrador.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell title="Criar conta Claris" description="Defina uma senha exclusiva da Claris. Ela nao e compartilhada com o Moodle.">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="new-password">Nova senha</Label>
          <Input id="new-password" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} disabled={isPreparing} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirmar senha</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={isPreparing} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" type="submit" disabled={isPreparing || isSubmitting || !!error && !password}>
          {isSubmitting ? 'Criando conta...' : 'Criar conta'}
        </Button>
      </form>
    </AuthShell>
  );
}
