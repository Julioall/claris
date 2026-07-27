import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authGateway } from '@/integrations/auth/auth-gateway';
import { AuthShell } from './AuthShell';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    let active = true;
    let recovered = false;

    const authorizeRecovery = () => {
      const recoverySession = authGateway.consumePasswordRecoverySession();
      if (!recoverySession || !active) return false;
      recovered = true;
      setHasRecoverySession(true);
      return true;
    };

    if (authorizeRecovery()) {
      setIsPreparing(false);
      return () => { active = false; };
    }

    const unsubscribe = authGateway.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) authorizeRecovery();
    });

    void (async () => {
      try {
        if (code) await authGateway.exchangeCodeForSession(code);
        if (!recovered) authorizeRecovery();
        if (!recovered && active) setError('O link de recuperacao e invalido ou expirou.');
      } catch {
        if (active) setError('O link de recuperacao e invalido ou expirou.');
      } finally {
        if (active) setIsPreparing(false);
      }
    })();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [searchParams]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!hasRecoverySession) {
      setError('O link de recuperacao e invalido ou expirou.');
      return;
    }
    if (password.length < 12) return setError('A senha deve ter ao menos 12 caracteres.');
    if (password !== confirmation) return setError('As senhas nao conferem.');
    setIsSubmitting(true);
    try {
      await authGateway.updatePassword(password);
      await authGateway.signOut('local');
      navigate('/login', { replace: true });
    } catch {
      setError('Nao foi possivel redefinir a senha. Solicite um novo link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell title="Redefinir senha" description="Crie uma nova senha exclusiva da sua conta Claris.">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2"><Label htmlFor="reset-password">Nova senha</Label><Input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={isPreparing} /></div>
        <div className="space-y-2"><Label htmlFor="reset-confirmation">Confirmar senha</Label><Input id="reset-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={isPreparing} /></div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" type="submit" disabled={isPreparing || isSubmitting || !hasRecoverySession}>{isSubmitting ? 'Salvando...' : 'Salvar nova senha'}</Button>
      </form>
    </AuthShell>
  );
}
