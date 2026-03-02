import { useState, useEffect, useRef, useMemo } from 'react';
import { Send, Loader2, AlertCircle, MessageSquare } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChat, ChatMessage } from '@/hooks/useChat';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ChatWindowProps {
  moodleUserId: string | number;
  studentName: string;
  className?: string;
  hideHeader?: boolean;
}

function MessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const time = format(new Date(message.timecreated * 1000), 'HH:mm', { locale: ptBR });
  const date = format(new Date(message.timecreated * 1000), 'dd/MM', { locale: ptBR });

  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm',
          isOwn
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
        )}
      >
        <div
          className="whitespace-pre-wrap break-words [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.text, {
            ALLOWED_TAGS: ['b', 'i', 'u', 'a', 'br', 'p', 'strong', 'em', 'span'],
            ALLOWED_ATTR: ['href', 'target', 'rel'],
          }) }}
        />
        <p className={cn('text-[10px] mt-1', isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
          {date} {time}
        </p>
      </div>
    </div>
  );
}

export function ChatWindow({ moodleUserId, studentName, className, hideHeader }: ChatWindowProps) {
  const { messages, isLoading, isSending, error, fetchMessages, sendMessage } = useChat();
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchMessages(moodleUserId);
  }, [moodleUserId, fetchMessages]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return;

    const text = newMessage;
    setNewMessage('');
    await sendMessage(moodleUserId, text);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      {!hideHeader && (
        <CardHeader className="pb-3 border-b shrink-0">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat com {studentName}
          </CardTitle>
        </CardHeader>
      )}

      <CardContent className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden">
        {/* Messages area */}
        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Verifique se as funções de messaging estão habilitadas no Moodle.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
              <p className="text-xs text-muted-foreground">Envie a primeira mensagem para iniciar a conversa</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.senderType === 'tutor'}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="p-3 border-t">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              className="min-h-[40px] max-h-[120px] resize-none"
              rows={1}
              disabled={isSending}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!newMessage.trim() || isSending}
              className="shrink-0"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
