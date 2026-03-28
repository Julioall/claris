import type { RefObject } from 'react';
import { AlertCircle, MessageCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { buildMessageGroups } from '@/features/whatsapp/lib/chat';
import type { WhatsAppMessage } from '@/features/whatsapp/types';
import { WhatsAppMessageBubble } from '@/features/whatsapp/components/WhatsAppMessageBubble';

const conversationBackgroundClassName = 'min-h-0 flex-1 overscroll-contain bg-muted/20';

interface WhatsAppMessageListProps {
  instanceId: string | null;
  messages: WhatsAppMessage[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: unknown;
  containerRef: RefObject<HTMLDivElement>;
}

function MessageListSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className={index % 2 === 0 ? 'flex justify-start' : 'flex justify-end'}>
          <Skeleton className="h-16 w-[70%] rounded-2xl" />
        </div>
      ))}
    </div>
  );
}

export function WhatsAppMessageList({
  instanceId,
  messages,
  isLoading,
  isRefreshing,
  error,
  containerRef,
}: WhatsAppMessageListProps) {
  const groups = buildMessageGroups(messages);

  return (
    <ScrollArea
      ref={containerRef}
      className={conversationBackgroundClassName}
      viewportClassName="h-full w-full"
    >
      {isLoading ? (
        <div className="px-2 py-3 sm:px-4 sm:py-4">
          <MessageListSkeleton />
        </div>
      ) : error ? (
        <div className="flex h-full items-center justify-center px-4 py-4">
          <div className="rounded-lg border border-destructive/20 bg-background/95 px-8 py-10 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive/70" />
            <p className="text-sm font-medium text-destructive">Falha ao carregar o historico</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : 'Erro desconhecido'}
            </p>
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex h-full items-center justify-center px-4 py-4">
          <div className="rounded-2xl border border-dashed bg-background px-8 py-10 text-center shadow-sm">
            <MessageCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">Nenhuma mensagem nesta conversa</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Envie uma mensagem ou um arquivo para iniciar o historico.
            </p>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-2 py-3 sm:gap-3 sm:px-4 sm:py-4">
          {isRefreshing && (
            <div className="sticky top-0 z-10 flex justify-center pb-3">
              <div className="inline-flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                <Spinner className="h-3.5 w-3.5" />
                Atualizando conversa...
              </div>
            </div>
          )}

          {groups.map((item) => (
            item.type === 'date' ? (
              <div key={item.id} className="flex justify-center py-2">
                <span className="rounded-full border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                  {item.label}
                </span>
              </div>
            ) : (
              <WhatsAppMessageBubble
                key={item.id}
                instanceId={instanceId}
                message={item.message}
              />
            )
          ))}
        </div>
      )}
    </ScrollArea>
  );
}
