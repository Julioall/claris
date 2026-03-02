import { useState, useEffect } from 'react';
import { MessageSquare, Search, Loader2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChat, Conversation } from '@/hooks/useChat';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

function ConversationItem({
  conversation,
  isSelected,
  onClick,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}) {
  const lastMsgTime = conversation.lastMessage
    ? formatDistanceToNow(new Date(conversation.lastMessage.timecreated * 1000), {
        addSuffix: true,
        locale: ptBR,
      })
    : '';

  // Strip HTML tags from last message preview
  const lastMsgPreview = conversation.lastMessage?.text
    ?.replace(/<[^>]*>/g, '')
    .substring(0, 60) || 'Sem mensagens';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg transition-colors hover:bg-muted/50',
        isSelected && 'bg-muted'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary shrink-0">
          {conversation.member.fullname.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sm truncate">{conversation.member.fullname}</p>
            {conversation.unreadcount > 0 && (
              <Badge variant="default" className="text-[10px] h-5 px-1.5">
                {conversation.unreadcount}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{lastMsgPreview}</p>
          {lastMsgTime && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{lastMsgTime}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Messages() {
  const { conversations, isLoading, error, fetchConversations } = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Auto-select first conversation when loaded
  useEffect(() => {
    if (!selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0]);
    }
  }, [conversations, selectedConversation]);

  const filteredConversations = conversations.filter((c) =>
    c.member.fullname.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mensagens</h1>
        <p className="text-muted-foreground">
          Converse com seus alunos via Moodle
        </p>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Erro ao carregar conversas</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Verifique se as funções de messaging (<code>core_message_*</code>) estão habilitadas no seu serviço Moodle.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chat layout - full height */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Conversation list */}
        <Card className="lg:col-span-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar conversa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa no Moodle'}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredConversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isSelected={selectedConversation?.id === conv.id}
                    onClick={() => setSelectedConversation(conv)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Chat area */}
        <div className="lg:col-span-2">
          {selectedConversation ? (
            <div className="space-y-2">
              {selectedConversation.studentId && (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/alunos/${selectedConversation.studentId}`}>
                      Ver perfil do aluno
                    </Link>
                  </Button>
                </div>
              )}
              <ChatWindow
                moodleUserId={selectedConversation.member.id}
                studentName={selectedConversation.member.fullname}
                className="h-full"
              />
            </div>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">Selecione uma conversa para começar</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
