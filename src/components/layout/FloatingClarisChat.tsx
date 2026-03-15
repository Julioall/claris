import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClarisIcon } from '@/components/ui/claris-logo';
import { cn } from '@/lib/utils';

type ChatRole = 'assistant' | 'user';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

const CLARIS_PLACEHOLDER_REPLY =
  'Ainda estou em desenvolvimento, mas em breve estarei aqui para te ajudar no acompanhamento dos nossos alunos com orientações e insights em tempo real.';

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Olá! Eu sou a Claris IA. Em breve estarei disponível para conversar com você por aqui.',
};

export function FloatingClarisChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);

  const canSend = useMemo(() => inputValue.trim().length > 0, [inputValue]);

  useEffect(() => {
    if (isOpen) {
      setIsChatVisible(true);
      return;
    }

    const timeoutId = window.setTimeout(() => setIsChatVisible(false), 180);
    return () => window.clearTimeout(timeoutId);
  }, [isOpen]);

  const handleSend = () => {
    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedMessage,
    };

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: CLARIS_PLACEHOLDER_REPLY,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInputValue('');
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {isChatVisible && (
        <div className="w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-card shadow-xl">
          <div
            className={cn(
              'transition-all duration-200 ease-out',
              isOpen ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-95 opacity-0 pointer-events-none'
            )}
          >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <ClarisIcon className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">Claris IA</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsOpen(false)}
              aria-label="Fechar chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="h-[320px] px-3 py-3">
            <div className="space-y-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-[90%] rounded-lg px-3 py-2 text-sm',
                    message.role === 'assistant'
                      ? 'bg-muted text-foreground'
                      : 'ml-auto bg-primary text-primary-foreground'
                  )}
                >
                  {message.content}
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="border-t p-2">
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                handleSend();
              }}
            >
              <Input
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="Digite sua mensagem..."
                aria-label="Mensagem para Claris IA"
              />
              <Button type="submit" size="icon" disabled={!canSend} aria-label="Enviar mensagem">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
          </div>
        </div>
      )}

      {!isOpen && (
        <Button
          type="button"
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg [&_svg]:h-12 [&_svg]:w-12"
          onClick={() => setIsOpen(true)}
          aria-label="Abrir chat da Claris IA"
        >
          <ClarisIcon className="h-full w-full" />
          <MessageCircle className="sr-only" />
        </Button>
      )}
    </div>
  );
}
