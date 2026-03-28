import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Link as LinkIcon,
  MessageCircle,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Send,
  WifiOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  callWhatsAppMessaging as invokeWhatsAppMessaging,
  fetchActiveWhatsAppInstances,
} from '@/features/whatsapp/api/messaging';
// importação removida, pois callWhatsAppMessaging já abstrai a chamada
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useBackgroundActivityFlag } from '@/contexts/BackgroundActivityContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type WhatsAppMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'error';

interface WhatsAppInstance {
  id: string;
  name: string;
  scope: 'personal' | 'shared';
  connection_status: string;
  is_active: boolean;
  is_blocked: boolean;
  last_activity_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface WhatsAppConversation {
  id: string;
  remote_jid: string;
  name: string;
  phone: string | null;
  unread_count: number;
  last_message_text: string;
  last_message_at: string | null;
  is_group: boolean;
}

interface WhatsAppMessage {
  id: string;
  remote_jid: string;
  text: string;
  sent_at: string | null;
  direction: 'incoming' | 'outgoing';
  status?: WhatsAppMessageStatus;
}

function sortInstances(instances: WhatsAppInstance[]) {
  return [...instances].sort((a, b) => {
    const aConnected = a.connection_status === 'connected' ? 0 : 1;
    const bConnected = b.connection_status === 'connected' ? 0 : 1;
    if (aConnected !== bConnected) return aConnected - bConnected;

    const aScope = a.scope === 'personal' ? 0 : 1;
    const bScope = b.scope === 'personal' ? 0 : 1;
    if (aScope !== bScope) return aScope - bScope;

    return a.name.localeCompare(b.name);
  });
}

function formatMessageTime(sentAt: string | null) {
  if (!sentAt) return '--:--';

  const date = new Date(sentAt);
  return Number.isNaN(date.getTime()) ? '--:--' : format(date, 'HH:mm');
}

function formatLastActivity(dateValue: string | null) {
  if (!dateValue) return 'Sem atividade recente';

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Sem atividade recente';

  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: ptBR,
  });
}

function getConnectionBadge(status: string) {
  const config: Record<string, { label: string; className: string }> = {
    connected: { label: 'Conectada', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    pending_connection: { label: 'Aguardando conexão', className: 'bg-amber-100 text-amber-700 border-amber-200' },
    disconnected: { label: 'Desconectada', className: 'bg-muted text-muted-foreground border-border' },
    draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground border-border' },
    blocked: { label: 'Bloqueada', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  };

  const current = config[status] ?? config.disconnected;
  return (
    <Badge variant="outline" className={current.className}>
      {current.label}
    </Badge>
  );
}

function getInstancePhone(instance: WhatsAppInstance | null) {
  const phoneNumber = instance?.metadata?.phone_number;
  return typeof phoneNumber === 'string' && phoneNumber.trim()
    ? `+${phoneNumber.replace(/\D/g, '')}`
    : null;
}

async function callWhatsAppMessaging(action: string, params: Record<string, unknown> = {}) {
  return invokeWhatsAppMessaging(action, params);
}

function WhatsAppStatusIcon({ status }: { status?: WhatsAppMessageStatus }) {
  if (status === 'read') {
    return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  }

  if (status === 'delivered') {
    return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
  }

  if (status === 'pending' || status === 'sent') {
    return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
  }

  return null;
}

function ConversationItem({
  conversation,
  isSelected,
  onSelect,
}: {
  conversation: WhatsAppConversation;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-3 text-left transition-colors',
        isSelected
          ? 'border-primary/30 bg-primary/5'
          : 'border-transparent hover:border-border hover:bg-muted/40',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
          {conversation.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{conversation.name}</p>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {conversation.last_message_at ? formatMessageTime(conversation.last_message_at) : '--:--'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {conversation.last_message_text}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="truncate text-[11px] text-muted-foreground">
              {conversation.phone ?? conversation.remote_jid}
            </p>
            <div className="flex items-center gap-1">
              {conversation.is_group && (
                <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">
                  Grupo
                </Badge>
              )}
              {conversation.unread_count > 0 && (
                <Badge className="h-5 rounded-full px-1.5 text-[10px]">
                  {conversation.unread_count}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const isOutgoing = message.direction === 'outgoing';

  return (
    <div className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
          isOutgoing
            ? 'rounded-br-md bg-emerald-100 text-emerald-950'
            : 'rounded-bl-md bg-background',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          <span>{formatMessageTime(message.sent_at)}</span>
          {isOutgoing && <WhatsAppStatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}

const ConversationList = memo(function ConversationList({
  conversations,
  isLoading,
  error,
  searchQuery,
  selectedConversationId,
  onSearchChange,
  onSelectConversation,
}: {
  conversations: WhatsAppConversation[];
  isLoading: boolean;
  error: unknown;
  searchQuery: string;
  selectedConversationId: string | null;
  onSearchChange: (value: string) => void;
  onSelectConversation: (conversationId: string) => void;
}) {
  return (
    <>
      <div className="border-b p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar conversa..."
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-9"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {conversations.length} conversa(s) encontrada(s)
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0" preventContentOverflow>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-6 w-6" />
          </div>
        ) : error ? (
          <div className="px-4 py-12 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive/70" />
            <p className="text-sm font-medium text-destructive">
              Falha ao carregar as conversas
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : 'Erro desconhecido'}
            </p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <MessageCircle className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa disponÃ­vel'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 p-4">
            {conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedConversationId === conversation.id}
                onSelect={() => onSelectConversation(conversation.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  );
});

const ConversationMessages = memo(function ConversationMessages({
  messages,
  isLoading,
  error,
  scrollRef,
}: {
  messages: WhatsAppMessage[];
  isLoading: boolean;
  error: unknown;
  scrollRef: RefObject<HTMLDivElement>;
}) {
  return (
    <ScrollArea ref={scrollRef} className="flex-1 bg-muted/20 px-4 py-4">
      {isLoading ? (
        <div className="flex h-full items-center justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <div className="px-4 py-12 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive/70" />
          <p className="text-sm font-medium text-destructive">
            Falha ao carregar o histÃ³rico
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </p>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex h-full items-center justify-center px-4 py-12 text-center">
          <div>
            <MessageCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhuma mensagem retornada para esta conversa.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      )}
    </ScrollArea>
  );
});

function MessageComposer({
  value,
  error,
  isSending,
  isGroup,
  onChange,
  onKeyDown,
  onSend,
}: {
  value: string;
  error: string | null;
  isSending: boolean;
  isGroup: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, [value]);

  return (
    <div className="border-t p-3">
      {error && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {isGroup && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          O envio para grupos ainda nÃ£o estÃ¡ disponÃ­vel nesta primeira integraÃ§Ã£o.
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={isGroup ? 'Envio para grupos em breve' : 'Digite uma mensagem no WhatsApp...'}
          className="min-h-[44px] max-h-[140px] resize-none overflow-y-auto"
          rows={1}
          disabled={isSending || isGroup}
        />
        <Button
          type="button"
          size="icon"
          onClick={onSend}
          disabled={!value.trim() || isSending || isGroup}
          aria-label="Enviar mensagem"
          className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
        >
          {isSending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export default function WhatsAppPage() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [draftMessage, setDraftMessage] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    data: instances = [],
    isLoading: isLoadingInstances,
    error: instancesError,
  } = useQuery({
    queryKey: ['page-whatsapp-instances'],
    queryFn: async () => {
      const { data, error } = await fetchActiveWhatsAppInstances();

      if (error) throw error;
      return sortInstances((data ?? []) as WhatsAppInstance[]);
    },
  });

  const selectedInstance = instances.find((instance) => instance.id === selectedInstanceId) ?? null;
  const canLoadChats = selectedInstance?.connection_status === 'connected';

  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
    error: conversationsError,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: ['whatsapp-conversations', selectedInstanceId],
    queryFn: async () => {
      const data = await callWhatsAppMessaging('get_chats', {
        instance_id: selectedInstanceId,
      });
      return (data.conversations ?? []) as WhatsAppConversation[];
    },
    enabled: !!selectedInstanceId && canLoadChats,
    refetchInterval: 15000,
  });

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  ) ?? null;

  const {
    data: messages = [],
    isLoading: isLoadingMessages,
    error: messagesError,
  } = useQuery({
    queryKey: ['whatsapp-messages', selectedInstanceId, selectedConversationId],
    queryFn: async () => {
      const data = await callWhatsAppMessaging('get_messages', {
        instance_id: selectedInstanceId,
        remote_jid: selectedConversationId,
        limit: 100,
      });
      return (data.messages ?? []) as WhatsAppMessage[];
    },
    enabled: !!selectedInstanceId && !!selectedConversationId && canLoadChats,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (!selectedInstanceId && instances.length > 0) {
      setSelectedInstanceId(instances[0].id);
      return;
    }

    if (selectedInstanceId && !instances.some((instance) => instance.id === selectedInstanceId)) {
      setSelectedInstanceId(instances[0]?.id ?? null);
    }
  }, [instances, selectedInstanceId]);

  useEffect(() => {
    const isDesktopViewport = typeof window !== 'undefined' ? window.innerWidth >= 768 : !isMobile;

    if (!selectedConversationId && conversations.length > 0 && isDesktopViewport) {
      setSelectedConversationId(conversations[0].id);
      return;
    }

    if (
      selectedConversationId
      && !conversations.some((conversation) => conversation.id === selectedConversationId)
    ) {
      setSelectedConversationId(isDesktopViewport ? (conversations[0]?.id ?? null) : null);
    }
  }, [conversations, isMobile, selectedConversationId]);

  useEffect(() => {
    if (!canLoadChats) {
      setSelectedConversationId(null);
    }
  }, [canLoadChats]);

  useEffect(() => {
    if (!scrollRef.current) return;

    const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport instanceof HTMLDivElement) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, selectedConversationId]);

  const filteredConversations = conversations.filter((conversation) => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) return true;

    return (
      conversation.name.toLowerCase().includes(normalizedQuery)
      || (conversation.phone ?? '').toLowerCase().includes(normalizedQuery)
      || conversation.remote_jid.toLowerCase().includes(normalizedQuery)
    );
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      return callWhatsAppMessaging('send_message', {
        instance_id: selectedInstanceId,
        remote_jid: selectedConversationId,
        message: text,
      });
    },
    onSuccess: (data) => {
      const sentMessage = (data.message ?? null) as WhatsAppMessage | null;
      if (!selectedInstanceId || !selectedConversationId || !sentMessage) {
        setDraftMessage('');
        setSendError(null);
        return;
      }

      queryClient.setQueryData<WhatsAppMessage[]>(
        ['whatsapp-messages', selectedInstanceId, selectedConversationId],
        (current = []) => (
          current.some((message) => message.id === sentMessage.id)
            ? current
            : [...current, sentMessage]
        ),
      );

      queryClient.setQueryData<WhatsAppConversation[]>(
        ['whatsapp-conversations', selectedInstanceId],
        (current = []) => {
          const updated = current.map((conversation) => (
            conversation.id === selectedConversationId
              ? {
                  ...conversation,
                  unread_count: 0,
                  last_message_text: sentMessage.text,
                  last_message_at: sentMessage.sent_at,
                }
              : conversation
          ));

          const selected = updated.find((conversation) => conversation.id === selectedConversationId);
          const remaining = updated.filter((conversation) => conversation.id !== selectedConversationId);

          return selected ? [selected, ...remaining] : updated;
        },
      );

      setDraftMessage('');
      setSendError(null);
    },
    onError: (error) => {
      setSendError(error instanceof Error ? error.message : 'Erro ao enviar mensagem');
    },
  });

  useBackgroundActivityFlag({
    id: selectedInstanceId ? `whatsapp:send:${selectedInstanceId}` : 'whatsapp:send',
    active: sendMutation.isPending,
    label: 'Enviando mensagem no WhatsApp',
    description: selectedConversation
      ? `Conversa com ${selectedConversation.name}`
      : 'Processando envio da mensagem.',
    source: 'whatsapp',
  });

  const handleSelectConversation = useCallback((conversationId: string) => {
    setSelectedConversationId(conversationId);
    setSendError(null);
  }, []);

  const handleBackToConversationList = useCallback(() => {
    setSelectedConversationId(null);
    setSendError(null);
  }, []);

  const handleSendMessage = useCallback(() => {
    const trimmedMessage = draftMessage.trim();
    if (!trimmedMessage || !selectedConversationId) return;
    if (selectedConversation?.is_group) return;

    setSendError(null);
    sendMutation.mutate(trimmedMessage);
  }, [draftMessage, selectedConversation, selectedConversationId, sendMutation]);

  const handleDraftKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const selectedInstancePhone = getInstancePhone(selectedInstance);

  if (isLoadingInstances) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (instancesError) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
          <p className="text-muted-foreground">
            Não foi possível carregar as instâncias conectadas.
          </p>
        </div>
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Falha ao buscar as instâncias do WhatsApp
                </p>
                <p className="text-sm text-muted-foreground">
                  {instancesError instanceof Error ? instancesError.message : 'Erro desconhecido'}
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/meus-servicos">Abrir Meus Serviços</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
            <p className="text-muted-foreground">
              Conecte sua instância da Evolution para começar a conversar por aqui.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/mensagens">
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Mensagens Moodle
            </Link>
          </Button>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Nenhuma instância disponível</p>
              <p className="max-w-lg text-sm text-muted-foreground">
                Use a tela de serviços para criar e conectar sua instância pessoal de WhatsApp,
                ou utilize uma instância compartilhada liberada pela administração.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/meus-servicos">
                  <LinkIcon className="mr-1.5 h-4 w-4" />
                  Abrir Meus Serviços
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/admin/servicos-aplicacao">Serviços da Aplicação</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-6rem)] min-h-0 flex-col animate-fade-in">
      <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
          <p className="text-muted-foreground">
            Conversas da Evolution integradas ao Claris com instância selecionável, histórico e envio direto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetchConversations()}
            disabled={!canLoadChats || isLoadingConversations}
          >
            <RefreshCw className={cn('mr-1.5 h-4 w-4', isLoadingConversations && 'animate-spin')} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/meus-servicos">
              <LinkIcon className="mr-1.5 h-4 w-4" />
              Meus Serviços
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/mensagens">
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Mensagens Moodle
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-4 grid shrink-0 gap-4 rounded-lg border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{selectedInstance?.name ?? 'Selecione uma instância'}</p>
            {selectedInstance && getConnectionBadge(selectedInstance.connection_status)}
            {selectedInstance && (
              <Badge variant="secondary">
                {selectedInstance.scope === 'personal' ? 'Pessoal' : 'Compartilhada'}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>Última atividade: {formatLastActivity(selectedInstance?.last_activity_at ?? null)}</span>
            {selectedInstancePhone && <span>Telefone: {selectedInstancePhone}</span>}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp-instance">Instância ativa</Label>
          <Select
            value={selectedInstanceId ?? ''}
            onValueChange={(value) => {
              setSelectedInstanceId(value);
              setSelectedConversationId(null);
              setSendError(null);
            }}
          >
            <SelectTrigger id="whatsapp-instance">
              <SelectValue placeholder="Selecione uma instância..." />
            </SelectTrigger>
            <SelectContent>
              {instances.map((instance) => (
                <SelectItem key={instance.id} value={instance.id}>
                  {instance.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!canLoadChats ? (
        <Card className="flex-1 border-dashed">
          <CardContent className="flex h-full flex-col items-center justify-center gap-3 py-14 text-center">
            <WifiOff className="h-12 w-12 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Instância ainda não conectada</p>
              <p className="max-w-lg text-sm text-muted-foreground">
                A conversa em tempo real fica disponível quando a instância estiver com status
                conectado em Meus Serviços ou em Serviços da Aplicação.
              </p>
            </div>
            <Button asChild>
              <Link to="/meus-servicos">Abrir Meus Serviços</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid h-full min-h-0 grid-cols-1 gap-0 overflow-hidden rounded-lg border lg:grid-cols-3">
          <div
            className={cn(
              'min-h-0 flex-col bg-card lg:col-span-1 lg:flex lg:border-r',
              isMobile ? (selectedConversation ? 'hidden' : 'flex') : 'flex',
            )}
          >
            <ConversationList
              conversations={filteredConversations}
              isLoading={isLoadingConversations}
              error={conversationsError}
              searchQuery={searchQuery}
              selectedConversationId={selectedConversationId}
              onSearchChange={setSearchQuery}
              onSelectConversation={handleSelectConversation}
            />
          </div>

          <div
            className={cn(
              'min-h-0 flex-col bg-card lg:col-span-2 lg:flex',
              isMobile ? (selectedConversation ? 'flex' : 'hidden') : 'flex',
            )}
          >
            {selectedConversation ? (
              <>
                <div className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {isMobile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleBackToConversationList}
                        aria-label="Voltar para conversas"
                        className="shrink-0 lg:hidden"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    )}
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                      {selectedConversation.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{selectedConversation.name}</p>
                        {selectedConversation.is_group && (
                          <Badge variant="secondary">Grupo</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        <span className="truncate">
                          {selectedConversation.phone ?? selectedConversation.remote_jid}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    Atualizada {formatLastActivity(selectedConversation.last_message_at)}
                  </span>
                </div>

                <ConversationMessages
                  messages={messages}
                  isLoading={isLoadingMessages}
                  error={messagesError}
                  scrollRef={scrollRef}
                />

                <MessageComposer
                  value={draftMessage}
                  error={sendError}
                  isSending={sendMutation.isPending}
                  isGroup={selectedConversation.is_group}
                  onChange={setDraftMessage}
                  onKeyDown={handleDraftKeyDown}
                  onSend={handleSendMessage}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <MessageCircle className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                  <p className="text-muted-foreground">Selecione uma conversa para começar</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
