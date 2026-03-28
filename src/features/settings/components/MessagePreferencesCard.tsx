import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  getStoredMessagePreferences,
  saveMessagePreferences,
  subscribeToMessagePreferences,
} from '@/features/messages/lib/message-preferences';

export function MessagePreferencesCard() {
  const [preferences, setPreferences] = useState(getStoredMessagePreferences);

  useEffect(() => subscribeToMessagePreferences(setPreferences), []);

  const handleSendOnEnterChange = (checked: boolean) => {
    const nextPreferences = {
      ...preferences,
      sendOnEnter: checked,
    };

    setPreferences(nextPreferences);
    saveMessagePreferences(nextPreferences);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Preferencias de Mensagens
        </CardTitle>
        <CardDescription>
          Controle atalhos e comportamento basico da tela de mensagens do Moodle.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="message-send-on-enter" className="cursor-pointer text-sm font-medium">
              Enviar mensagem com Enter
            </Label>
            <p className="text-xs text-muted-foreground">
              Quando desligado, o envio acontece apenas pelo botao para evitar disparos acidentais.
            </p>
          </div>

          <Switch
            id="message-send-on-enter"
            checked={preferences.sendOnEnter}
            onCheckedChange={handleSendOnEnterChange}
          />
        </div>

        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-sm font-medium">
            {preferences.sendOnEnter ? 'Enter ativo para envio.' : 'Enter desativado para envio.'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {preferences.sendOnEnter
              ? 'Pressionar Enter envia a mensagem; Shift + Enter continua criando quebra de linha.'
              : 'Pressionar Enter cria uma nova linha e o envio fica restrito ao botao da conversa.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
