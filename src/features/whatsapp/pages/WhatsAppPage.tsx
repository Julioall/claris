import { useEffect, useRef } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  MessageCircle,
  Phone,
  WifiOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { WhatsAppAvatar } from '@/features/whatsapp/components/WhatsAppAvatar';
import { WhatsAppComposer } from '@/features/whatsapp/components/WhatsAppComposer';
import { WhatsAppMessageList } from '@/features/whatsapp/components/WhatsAppMessageList';
import { WhatsAppSidebar } from '@/features/whatsapp/components/WhatsAppSidebar';
import { useWhatsAppWorkspace } from '@/features/whatsapp/hooks/useWhatsAppWorkspace';
import { formatRelativeDate, getInstancePhone } from '@/features/whatsapp/lib/chat';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

function getConnectionBadge(status: string) {
  const config: Record<string, { label: string; className: string }> = {
    connected: { label: 'Conectada', className: 'border-primary/20 bg-primary/10 text-primary' },
    pending_connection: {
      label: 'Aguardando conexao',
      className: 'border-border bg-secondary text-secondary-foreground',
    },
    disconnected: {
      label: 'Desconectada',
      className: 'border-border bg-secondary text-secondary-foreground',
    },
    draft: { label: 'Rascunho', className: 'border-border bg-secondary text-secondary-foreground' },
    blocked: { label: 'Bloqueada', className: 'border-destructive/20 bg-destructive/10 text-destructive' },
  };

  const current = config[status] ?? config.disconnected;
  return (
    <Badge variant="outline" className={current.className}>
      {current.label}
    </Badge>
  );
}

export default function WhatsAppPage() {
  const isMobile = useIsMobile();
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const {
    instances,
    isLoadingInstances,
    instancesError,
    selectedInstance,
    selectedInstanceId,
    setSelectedInstanceId,
    canLoadChats,
    directoryTab,
    setDirectoryTab,
    searchQuery,
    setSearchQuery,
    filteredChats,
    filteredContacts,
    isLoadingContacts,
    isFetchingContacts,
    contactsError,
    isLoadingConversations,
    isFetchingConversations,
    conversationsError,
    selectedThread,
    selectedThreadId,
    handleSelectThread,
    messages,
    isLoadingMessages,
    isFetchingMessages,
    messagesError,
    draftMessage,
    setDraftMessage,
    draftAttachment,
    sendError,
    sendMutation,
    uploadProgress,
    uploadStage,
    isCaptionDisabled,
    handleAttachmentSelection,
    handleRemoveAttachment,
    handleToggleSticker,
    handleSend,
    setSelectedThreadId,
  } = useWhatsAppWorkspace();

  useEffect(() => {
    const container = messageContainerRef.current;
    const viewport = container?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
    if (!viewport) return;

    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
  }, [messages, selectedThread?.id]);

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
          <p className="text-muted-foreground">Nao foi possivel carregar as instancias conectadas.</p>
        </div>
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">Falha ao buscar as instancias do WhatsApp</p>
                <p className="text-sm text-muted-foreground">
                  {instancesError instanceof Error ? instancesError.message : 'Erro desconhecido'}
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/meus-servicos">Abrir Meus Servicos</Link>
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
              Conecte sua instancia da Evolution para comecar a conversar por aqui.
            </p>
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Nenhuma instancia disponivel</p>
              <p className="max-w-lg text-sm text-muted-foreground">
                Use a tela de servicos para criar e conectar sua instancia pessoal de WhatsApp,
                ou utilize uma instancia compartilhada liberada pela administracao.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/meus-servicos">Abrir Meus Servicos</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/admin/servicos-aplicacao">Servicos da Aplicacao</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-6rem)] min-h-0 flex-col gap-3 animate-fade-in">
      <div className="shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
          <p className="text-muted-foreground">
            Chat individual do WhatsApp com lista de conversas, contatos sincronizados e envio de
            midia. Campanhas e automacoes ficam em modulos dedicados.
          </p>
        </div>
      </div>

      <div className="grid shrink-0 gap-4 rounded-2xl border bg-card px-4 py-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{selectedInstance?.name ?? 'Selecione uma instancia'}</p>
            {selectedInstance && getConnectionBadge(selectedInstance.connection_status)}
            {selectedInstance && (
              <Badge variant="secondary">
                {selectedInstance.scope === 'personal' ? 'Pessoal' : 'Compartilhada'}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>Ultima atividade: {formatRelativeDate(selectedInstance?.last_activity_at ?? null)}</span>
            {selectedInstancePhone && <span>Telefone: {selectedInstancePhone}</span>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="whatsapp-instance">Instancia ativa</Label>
          <Select
            value={selectedInstanceId ?? ''}
            onValueChange={(value) => {
              setSelectedInstanceId(value);
              setSelectedThreadId(null);
            }}
          >
            <SelectTrigger id="whatsapp-instance">
              <SelectValue placeholder="Selecione uma instancia..." />
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
              <p className="text-sm font-medium">Instancia ainda nao conectada</p>
              <p className="max-w-lg text-sm text-muted-foreground">
                A conversa em tempo real fica disponivel quando a instancia estiver com status conectado.
              </p>
            </div>
            <Button asChild>
              <Link to="/meus-servicos">Abrir Meus Servicos</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-2xl border bg-card lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className={cn('min-h-0', isMobile && selectedThread ? 'hidden' : 'block')}>
            <WhatsAppSidebar
              directoryTab={directoryTab}
              searchQuery={searchQuery}
              chats={filteredChats}
              contacts={filteredContacts}
              isLoadingChats={isLoadingConversations}
              isLoadingContacts={isLoadingContacts}
              isRefreshingChats={isFetchingConversations}
              isRefreshingContacts={isFetchingContacts}
              chatsError={conversationsError}
              contactsError={contactsError}
              selectedThreadId={selectedThreadId}
              onDirectoryTabChange={setDirectoryTab}
              onSearchChange={setSearchQuery}
              onSelectThread={handleSelectThread}
            />
          </div>

          <div
            className={cn(
              'min-h-0 min-w-0 flex-col overflow-hidden bg-card',
              isMobile && !selectedThread ? 'hidden' : 'flex',
            )}
          >
            {selectedThread ? (
              <>
                <div className="flex shrink-0 items-center justify-between gap-4 border-b bg-card px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {isMobile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedThreadId(null)}
                        aria-label="Voltar para conversas"
                        className="shrink-0"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    )}

                    <WhatsAppAvatar
                      name={selectedThread.name}
                      imageUrl={selectedThread.profile_picture_url}
                      className="h-12 w-12"
                    />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{selectedThread.name}</p>
                        {selectedThread.is_group && <Badge variant="secondary">Grupo</Badge>}
                        {!selectedThread.has_chat && <Badge variant="outline">Novo chat</Badge>}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        <span className="truncate">{selectedThread.phone ?? selectedThread.remote_jid}</span>
                        {isFetchingMessages && (
                          <span className="inline-flex items-center gap-1">
                            <Spinner className="h-3 w-3" />
                            Atualizando...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    Atualizada {formatRelativeDate(selectedThread.last_message_at)}
                  </span>
                </div>

                <WhatsAppMessageList
                  instanceId={selectedInstanceId}
                  messages={messages}
                  isLoading={isLoadingMessages}
                  isRefreshing={isFetchingMessages && !isLoadingMessages}
                  error={messagesError}
                  containerRef={messageContainerRef}
                />

                <WhatsAppComposer
                  value={draftMessage}
                  attachment={draftAttachment}
                  error={sendError}
                  isSending={sendMutation.isPending}
                  isGroup={selectedThread.is_group}
                  uploadProgress={uploadProgress}
                  uploadStage={uploadStage}
                  isCaptionDisabled={isCaptionDisabled}
                  onChange={setDraftMessage}
                  onSend={handleSend}
                  onSelectFiles={handleAttachmentSelection}
                  onRemoveAttachment={handleRemoveAttachment}
                  onToggleSticker={handleToggleSticker}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center bg-card">
                <div className="rounded-2xl border border-dashed bg-background px-8 py-10 text-center shadow-sm">
                  <MessageCircle className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm font-medium">Selecione uma conversa ou contato</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    A lista lateral separa historico de conversas e agenda de contatos sincronizados pela Evolution.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
