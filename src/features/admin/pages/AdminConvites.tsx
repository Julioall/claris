import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import {
  createClarisInvitation,
  listClarisInvitations,
  resendClarisInvitation,
  revokeClarisInvitation,
} from '../api/claris-invitations';

export default function AdminConvites() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const invitations = useQuery({ queryKey: ['claris-invitations'], queryFn: listClarisInvitations });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['claris-invitations'] });
  const create = useMutation({
    mutationFn: createClarisInvitation,
    onSuccess: () => {
      setEmail('');
      setFullName('');
      void refresh();
      toast({ title: 'Convite enviado', description: 'O link foi enviado pelo provedor de e-mail configurado.' });
    },
    onError: (error) => toast({ title: 'Falha ao convidar', description: error.message, variant: 'destructive' }),
  });
  const resend = useMutation({ mutationFn: resendClarisInvitation, onSuccess: refresh });
  const revoke = useMutation({ mutationFn: revokeClarisInvitation, onSuccess: refresh });

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Convites Claris</h1><p className="text-muted-foreground">O cadastro e fechado e o papel inicial e definido pelo backend.</p></div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MailPlus className="h-5 w-5" />Novo convite</CardTitle><CardDescription>O convidado definira uma senha exclusiva da Claris.</CardDescription></CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); create.mutate({ email, fullName }); }}>
            <div className="space-y-2"><Label htmlFor="invite-name">Nome completo</Label><Input id="invite-name" value={fullName} onChange={(event) => setFullName(event.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="invite-email">E-mail</Label><Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Enviando...' : 'Convidar tutor'}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Historico recente</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>E-mail</TableHead><TableHead>Status</TableHead><TableHead>Expira em</TableHead><TableHead className="text-right">Acoes</TableHead></TableRow></TableHeader>
            <TableBody>{(invitations.data ?? []).map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.emailMasked}</TableCell><TableCell><Badge variant={item.status === 'pending' ? 'default' : 'secondary'}>{item.status}</Badge></TableCell><TableCell>{new Date(item.expiresAt).toLocaleString('pt-BR')}</TableCell>
                <TableCell className="space-x-2 text-right">{item.status === 'pending' && <><Button size="sm" variant="outline" onClick={() => resend.mutate(item.id)}>Reenviar</Button><Button size="sm" variant="destructive" onClick={() => revoke.mutate(item.id)}>Revogar</Button></>}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          {!invitations.isLoading && (invitations.data?.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum convite encontrado.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
