import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, MessageSquare, Send } from 'lucide-react';
import DOMPurify from 'dompurify';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  getStoredMessagePreferences,
  subscribeToMessagePreferences,
} from '@/features/messages/lib/message-preferences';

import { useChat, type ChatMessage, type UseChatResult } from '../hooks/useChat';

interface ChatWindowProps {
  moodleUserId: string | number;
  studentName: string;
  className?: string;
  hideHeader?: boolean;
  chat?: UseChatResult;
}

function formatMessageDayLabel(timecreated: number) {
  const date = new Date(timecreated * 1000);

  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';

  return format(date, "dd 'de' MMM", { locale: ptBR });
}

function sanitizeMessageHtml(text: string) {
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ['a', 'b', 'br', 'em', 'i', 'p', 'span', 'strong', 'u'],
    ALLOWED_ATTR: ['href', 'rel', 'target'],
  });
}

function MessageBubble({
  message,
  authorLabel,
  isOwn,
  isGroupedWithPrevious,
  isGroupedWithNext,
}: {
  message: ChatMessage;
  authorLabel: string;
  isOwn: boolean;
  isGroupedWithPrevious: boolean;
  isGroupedWithNext: boolean;
}) {
  const time = format(new Date(message.timecreated * 1000), 'HH:mm', { locale: ptBR });

  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start', isGroupedWithPrevious ? 'mt-1.5' : 'mt-4 first:mt-0')}>
      <div className={cn('max-w-[82%] min-w-0', isOwn ? 'items-end' : 'items-start')}>
        {!isGroupedWithPrevious && (
          <p className={cn('mb-1 px-1 text-[11px] font-medium text-muted-foreground', isOwn ? 'text-right' : 'text-left')}>
            {authorLabel}
          </p>
        )}

        <div
          className={cn(
            'border px-4 py-3 text-sm shadow-sm',
            isOwn
              ? 'border-primary/20 bg-primary text-primary-foreground'
              : 'border-border/70 bg-background',
            isOwn ? 'rounded-3xl rounded-br-md' : 'rounded-3xl rounded-bl-md',
            isOwn && isGroupedWithPrevious && 'rounded-tr-lg',
            isOwn && isGroupedWithNext && 'rounded-br-lg',
            !isOwn && isGroupedWithPrevious && 'rounded-tl-lg',
            !isOwn && isGroupedWithNext && 'rounded-bl-lg',
          )}
        >
          <div
            className="whitespace-pre-wrap break-words leading-6 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: sanitizeMessageHtml(message.text) }}
          />

          {!isGroupedWithNext && (
            <p className={cn('mt-2 text-[10px]', isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
              {time}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function buildMessageRows(messages: ChatMessage[]) {
  return messages.flatMap((message, index) => {
    const previousMessage = messages[index - 1];
    const nextMessage = messages[index + 1];
    const showDaySeparator =
      !previousMessage
      || !isSameDay(new Date(previousMessage.timecreated * 1000), new Date(message.timecreated * 1000));
    const isGroupedWithPrevious =
      !!previousMessage
      && previousMessage.senderType === message.senderType
      && isSameDay(new Date(previousMessage.timecreated * 1000), new Date(message.timecreated * 1000));
    const isGroupedWithNext =
      !!nextMessage
      && nextMessage.senderType === message.senderType
      && isSameDay(new Date(nextMessage.timecreated * 1000), new Date(message.timecreated * 1000));

    return [
      ...(showDaySeparator
        ? [
            {
              type: 'day' as const,
              key: `day-${message.id}`,
              label: formatMessageDayLabel(message.timecreated),
            },
          ]
        : []),
      {
        type: 'message' as const,
        key: message.id,
        message,
        isGroupedWithPrevious,
        isGroupedWithNext,
      },
    ];
  });
}

function isNearBottom(element: HTMLDivElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 72;
}

export function ChatWindow({ moodleUserId, studentName, className, hideHeader, chat }: ChatWindowProps) {
  const internalChat = useChat();
  const chatController = chat ?? internalChat;
  const {
    messages,
    activeMessagesUserId,
    messagesError,
    isLoadingMessages,
    isRefreshingMessages,
    isSending,
    fetchMessages,
    sendMessage,
    getCachedMessages,
  } = chatController;
  const [newMessage, setNewMessage] = useState('');
  const [messagePreferences, setMessagePreferences] = useState(getStoredMessagePreferences);
  const [sendFeedback, setSendFeedback] = useState<'idle' | 'sent'>('idle');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousMessageCountRef = useRef(0);
  const shouldStickToBottomRef = useRef(true);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const activeConversationKey = String(moodleUserId);

  useEffect(() => subscribeToMessagePreferences(setMessagePreferences), []);

  const visibleMessages = useMemo(() => {
    if (activeMessagesUserId === activeConversationKey) {
      return messages;
    }

    return getCachedMessages(moodleUserId);
  }, [activeConversationKey, activeMessagesUserId, getCachedMessages, messages, moodleUserId]);

  const messageRows = useMemo(() => buildMessageRows(visibleMessages), [visibleMessages]);

  const clearFeedbackTimeout = () => {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
  };

  const getViewport = () =>
    scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const viewport = getViewport();
      if (!viewport) return;
      viewport.scrollTop = viewport.scrollHeight;
    });
  }, []);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    previousMessageCountRef.current = 0;
    setSendFeedback('idle');
    clearFeedbackTimeout();
    void fetchMessages(moodleUserId);
  }, [moodleUserId, fetchMessages]);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return undefined;

    const handleScroll = () => {
      shouldStickToBottomRef.current = isNearBottom(viewport);
    };

    handleScroll();
    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [activeConversationKey]);

  useEffect(() => {
    const messageCountIncreased = visibleMessages.length > previousMessageCountRef.current;
    if (messageCountIncreased && shouldStickToBottomRef.current) {
      scrollToBottom();
    }

    previousMessageCountRef.current = visibleMessages.length;
  }, [scrollToBottom, visibleMessages]);

  useEffect(() => () => clearFeedbackTimeout(), []);

  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return;

    const text = newMessage;
    shouldStickToBottomRef.current = true;
    setNewMessage('');
    clearFeedbackTimeout();

    const sent = await sendMessage(moodleUserId, text);
    if (sent) {
      setSendFeedback('sent');
      feedbackTimeoutRef.current = window.setTimeout(() => {
        setSendFeedback('idle');
        feedbackTimeoutRef.current = null;
      }, 2500);
    }

    textareaRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (messagePreferences.sendOnEnter && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const footerStatus = isSending
    ? 'Enviando...'
    : sendFeedback === 'sent'
      ? 'Mensagem enviada agora'
      : isRefreshingMessages && visibleMessages.length > 0
        ? 'Atualizando conversa...'
        : null;

  return (
    <Card className={cn('flex h-full flex-col overflow-hidden', className)}>
      {!hideHeader && (
        <CardHeader className="shrink-0 border-b pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Chat com {studentName}
          </CardTitle>
        </CardHeader>
      )}

      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <ScrollArea ref={scrollRef} className="flex-1 bg-muted/20 p-4">
          {isLoadingMessages ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="h-6 w-6" />
            </div>
          ) : messagesError && visibleMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
              <p className="text-sm font-medium text-destructive">Erro ao carregar mensagens</p>
              <p className="mt-1 text-xs text-muted-foreground">{messagesError}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Verifique se as funcoes de messaging estao habilitadas no Moodle.
              </p>
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
              <p className="text-xs text-muted-foreground">
                Envie a primeira mensagem para iniciar a conversa.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {isRefreshingMessages && (
                <div className="sticky top-0 z-10 flex justify-center pb-3">
                  <div className="inline-flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                    <Spinner className="h-3.5 w-3.5" />
                    Atualizando conversa...
                  </div>
                </div>
              )}

              {messagesError && visibleMessages.length > 0 && (
                <div className="mb-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {messagesError}
                </div>
              )}

              {messageRows.map((row) =>
                row.type === 'day' ? (
                  <div key={row.key} className="flex justify-center pt-2">
                    <div className="rounded-full border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                      {row.label}
                    </div>
                  </div>
                ) : (
                  <MessageBubble
                    key={row.key}
                    message={row.message}
                    authorLabel={row.message.senderType === 'tutor' ? 'Voce' : studentName}
                    isOwn={row.message.senderType === 'tutor'}
                    isGroupedWithPrevious={row.isGroupedWithPrevious}
                    isGroupedWithNext={row.isGroupedWithNext}
                  />
                ),
              )}
            </div>
          )}
        </ScrollArea>

        <div className="shrink-0 border-t bg-background p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              className="min-h-[44px] max-h-[140px] resize-none border-border/70 bg-background"
              rows={1}
              disabled={isSending}
            />
            <Button
              size="icon"
              onClick={() => void handleSend()}
              disabled={!newMessage.trim() || isSending}
              className="h-11 w-11 shrink-0"
              aria-label="Enviar mensagem"
            >
              {isSending ? <Spinner className="h-4 w-4" onAccent /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 px-1">
            {footerStatus ? (
              <p className="text-[11px] text-muted-foreground">{footerStatus}</p>
            ) : (
              <span />
            )}
            {visibleMessages.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {visibleMessages.length} {visibleMessages.length === 1 ? 'mensagem' : 'mensagens'}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
