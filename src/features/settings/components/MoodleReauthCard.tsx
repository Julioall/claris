import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  fetchMoodleReauthSettings,
  updateMoodleReauthSettings,
} from '@/features/settings/api';

function formatDateTime(value: string | null) {
  if (!value) return 'Nunca';
  return format(new Date(value), "dd 'de' MMMM 'de' yyyy 'as' HH:mm", { locale: ptBR });
}

interface MoodleReauthCardProps {
  userId: string;
}

export function MoodleReauthCard({ userId }: MoodleReauthCardProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'moodle-reauth', userId],
    queryFn: () => fetchMoodleReauthSettings(userId),
  });

  const mutation = useMutation({
    mutationFn: updateMoodleReauthSettings,
    onSuccess: async (result) => {
      toast({
        title: result.preferenceEnabled
          ? 'Reautorizacao automatica atualizada'
          : 'Reautorizacao automatica desativada',
        description: result.message
          ?? (result.preferenceEnabled
            ? 'Os jobs em segundo plano poderao renovar a sessao do Moodle.'
            : 'Os jobs em segundo plano nao tentarao renovar a sessao do Moodle.'),
      });

      await queryClient.invalidateQueries({
        queryKey: ['settings', 'moodle-reauth', userId],
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar reautorizacao automatica',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const preferenceEnabled = data?.preferenceEnabled ?? true;
  const credentialActive = data?.credentialActive ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Jobs em Segundo Plano
        </CardTitle>
        <CardDescription>
          Controle se envios e execucoes agendadas podem renovar o token do Moodle sem depender desta aba aberta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="background-reauth-setting" className="cursor-pointer text-sm font-medium">
              Permitir reautorizacao automatica para jobs em segundo plano
            </Label>
            <p className="text-xs text-muted-foreground">
              Quando habilitado, sua credencial do Moodle e cifrada no servidor para que envios e execucoes agendadas possam renovar o token sem depender desta aba aberta.
            </p>
          </div>
          <Switch
            id="background-reauth-setting"
            checked={preferenceEnabled}
            disabled={isLoading || mutation.isPending}
            onCheckedChange={(checked) => mutation.mutate(checked)}
          />
        </div>

        <div className="rounded-md border p-3 bg-muted/30 space-y-2">
          <p className="text-sm font-medium">
            {preferenceEnabled
              ? credentialActive
                ? 'Ativada e pronta para uso.'
                : 'Ativada por padrao, mas ainda precisa de uma sessao recente para guardar a credencial.'
              : 'Desativada para esta conta.'}
          </p>
          <p className="text-xs text-muted-foreground">
            {preferenceEnabled
              ? credentialActive
                ? 'Os jobs em segundo plano podem renovar o token do Moodle automaticamente.'
                : 'Se esta conta nao tiver uma credencial salva ainda, faca logout e login novamente para concluir a ativacao.'
              : 'Enquanto estiver desligada, execucoes agendadas dependerao da sua sessao atual ou falharao quando precisarem renovar o token.'}
          </p>

          {data?.lastReauthAt ? (
            <p className="text-xs text-muted-foreground">
              Ultima renovacao automatica: {formatDateTime(data.lastReauthAt)}
            </p>
          ) : null}

          {data?.lastError ? (
            <p className="text-xs text-destructive">
              Ultimo erro: {data.lastError}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
