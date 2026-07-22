import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authGateway } from '@/integrations/auth/auth-gateway';
import { buildClarisAuthRedirect } from '../api/claris-account';
import { AuthShell } from './AuthShell';

const GENERIC_SUCCESS = 'Se o e-mail estiver cadastrado, enviaremos as instrucoes de recuperacao.';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    try {
      await authGateway.resetPasswordForEmail(
        email.trim().toLowerCase(),
        buildClarisAuthRedirect('/reset-password'),
      );
    } catch {
      // The response remains identical to avoid enumerating registered accounts.
    } finally {
      setMessage(GENERIC_SUCCESS);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell title="Recuperar senha" description="Informe o e-mail da sua conta Claris.">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="recovery-email">E-mail</Label>
          <Input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        <Button className="w-full" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Enviando...' : 'Enviar instrucoes'}</Button>
        <Button asChild variant="ghost" className="w-full"><Link to="/login">Voltar ao login</Link></Button>
      </form>
    </AuthShell>
  );
}
