import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, MessageSquare, Search } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { ChatWindow } from '@/features/claris/components/ChatWindow';
import { useChat, type Conversation } from '@/features/claris/hooks/useChat';
import { cn } from '@/lib/utils';

function formatConversationTime(timecreated?: number) {
  if (!timecreated) return '';

  const date = new Date(timecreated * 1000);
  if (isToday(date)) return format(date, 'HH:mm', { locale: ptBR });
  if (isYesterday(date)) return 'Ontem';
  return format(date, 'dd/MM', { locale: ptBR });
}

function getConversationPreview(conversation: Conversation) {
  return conversation.lastMessage?.text?.replace(/<[^>]*>/g, '').trim() || 'Sem mensagens';
}

function ConversationItem({
  conversation,
  isSelected,
  onClick,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}) {
  const preview = getConversationPreview(conversation);
  const timestamp = formatConversationTime(conversation.lastMessage?.timecreated);
  const hasUnread = conversation.unreadcount > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full max-w-full overflow-hidden rounded-2xl border px-3 py-3 text-left transition-colors',
        'hover:border-border hover:bg-muted/40',
        isSelected && 'border-primary/30 bg-primary/5 shadow-sm',
        hasUnread && !isSelected && 'border-primary/15 bg-primary/5',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="h-11 w-11 shrink-0">
          <AvatarImage src={conversation.member.profileimageurl ?? undefined} alt={conversation.member.fullname} />
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            {conversation.member.fullname.charAt(0)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={cn('truncate text-sm', hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>
                {conversation.member.fullname}
              </p>
              <p className={cn('mt-1 line-clamp-2 text-xs', hasUnread ? 'text-foreground' : 'text-muted-foreground')}>
                {preview}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              {timestamp && <span className="text-[11px] text-muted-foreground">{timestamp}</span>}
              {hasUnread && (
                <Badge variant="default" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
                  {conversation.unreadcount}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function MessagesPage() {
  const chat = useChat();
  const {
    conversations,
    isLoadingConversations,
    isRefreshingConversations,
    conversationsError,
    fetchConversations,
  } = chat;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (conversations.length === 0) {
      setSelectedConversationId(null);
      return;
    }

    setSelectedConversationId((currentSelection) => {
      if (currentSelection && conversations.some((conversation) => conversation.id === currentSelection)) {
        return currentSelection;
      }

      return conversations[0].id;
    });
  }, [conversations]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredConversations = useMemo(() => {
    if (!normalizedSearchQuery) return conversations;

    return conversations.filter((conversation) => {
      const preview = getConversationPreview(conversation).toLowerCase();
      return (
        conversation.member.fullname.toLowerCase().includes(normalizedSearchQuery)
        || preview.includes(normalizedSearchQuery)
      );
    });
  }, [conversations, normalizedSearchQuery]);

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4 animate-fade-in">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Mensagens</h1>
        <p className="text-muted-foreground">
          Canal individual do Moodle. Campanhas e automacoes ficam em modulos separados, e o
          WhatsApp segue como chat proprio.
        </p>
      </div>

      {conversationsError && (
        <Card className="shrink-0 border-destructive/50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">Erro ao carregar conversas</p>
                <p className="mt-1 text-xs text-muted-foreground">{conversationsError}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Verifique se as funcoes de messaging (<code>core_message_*</code>) estao habilitadas no Moodle.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid h-full min-h-0 grid-cols-1 gap-0 overflow-hidden rounded-2xl border lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r bg-card">
          <div className="shrink-0 border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar conversa..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{conversations.length} {conversations.length === 1 ? 'conversa' : 'conversas'}</span>
              {isRefreshingConversations && (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="h-3.5 w-3.5" />
                  Atualizando...
                </span>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0 w-full" preventContentOverflow>
            {isLoadingConversations ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="h-6 w-6" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {normalizedSearchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa no Moodle'}
                </p>
              </div>
            ) : (
              <div className="w-full space-y-2 p-4">
                {filteredConversations.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={selectedConversation?.id === conversation.id}
                    onClick={() => setSelectedConversationId(conversation.id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col bg-card">
          {selectedConversation ? (
            <>
              <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={selectedConversation.member.profileimageurl ?? undefined} alt={selectedConversation.member.fullname} />
                      <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                        {selectedConversation.member.fullname.charAt(0)}
                      </AvatarFallback>
                    </Avatar>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {selectedConversation.member.fullname}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedConversation.unreadcount > 0
                        ? `${selectedConversation.unreadcount} nova${selectedConversation.unreadcount > 1 ? 's' : ''}`
                        : 'Conversa sincronizada sob demanda'}
                    </p>
                  </div>
                </div>

                {selectedConversation.studentId && (
                  <Link
                    to={`/alunos/${selectedConversation.studentId}`}
                    className="shrink-0 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    Ver perfil
                  </Link>
                )}
              </div>

              <ChatWindow
                chat={chat}
                moodleUserId={selectedConversation.member.id}
                studentName={selectedConversation.member.fullname}
                className="min-h-0 flex-1 rounded-none border-0 shadow-none"
                hideHeader
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                <p className="text-muted-foreground">Selecione uma conversa para comecar</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
