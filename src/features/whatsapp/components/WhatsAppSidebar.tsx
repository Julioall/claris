import { AlertCircle, Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatMessageTime, formatRelativeDate } from '@/features/whatsapp/lib/chat';
import type { WhatsAppChatListItem, WhatsAppContactListItem } from '@/features/whatsapp/types';
import { WhatsAppAvatar } from '@/features/whatsapp/components/WhatsAppAvatar';
import { cn } from '@/lib/utils';

interface WhatsAppSidebarProps {
  directoryTab: 'chats' | 'contacts';
  searchQuery: string;
  chats: WhatsAppChatListItem[];
  contacts: WhatsAppContactListItem[];
  isLoadingChats: boolean;
  isLoadingContacts: boolean;
  isRefreshingChats: boolean;
  isRefreshingContacts: boolean;
  chatsError: unknown;
  contactsError: unknown;
  selectedThreadId: string | null;
  onDirectoryTabChange: (value: 'chats' | 'contacts') => void;
  onSearchChange: (value: string) => void;
  onSelectThread: (threadId: string) => void;
}

function SidebarSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-2xl border p-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SidebarError({ error, title }: { error: unknown; title: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive/70" />
      <p className="text-sm font-medium text-destructive">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {error instanceof Error ? error.message : 'Erro desconhecido'}
      </p>
    </div>
  );
}

function ChatRow({
  chat,
  isSelected,
  onSelect,
}: {
  chat: WhatsAppChatListItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const hasUnread = chat.unread_count > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
        'hover:border-border hover:bg-muted/40',
        isSelected && 'border-primary/30 bg-primary/5 shadow-sm',
        hasUnread && !isSelected && 'border-primary/15 bg-primary/5',
      )}
    >
      <div className="flex items-start gap-3">
        <WhatsAppAvatar name={chat.name} imageUrl={chat.profile_picture_url} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{chat.name}</p>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatMessageTime(chat.last_message_at)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{chat.last_message_text}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-h-5 items-center gap-1">
              {chat.is_group && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  Grupo
                </Badge>
              )}
              {chat.unread_count > 0 && (
                <Badge variant="default" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
                  {chat.unread_count}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function ContactRow({
  contact,
  isSelected,
  onSelect,
}: {
  contact: WhatsAppContactListItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const hasUnread = contact.unread_count > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
        'hover:border-border hover:bg-muted/40',
        isSelected && 'border-primary/30 bg-primary/5 shadow-sm',
        hasUnread && !isSelected && 'border-primary/15 bg-primary/5',
      )}
    >
      <div className="flex items-start gap-3">
        <WhatsAppAvatar name={contact.name} imageUrl={contact.profile_picture_url} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{contact.name}</p>
            {contact.last_message_at && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatMessageTime(contact.last_message_at)}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {contact.has_chat ? `Atualizado ${formatRelativeDate(contact.updated_at)}` : 'Sem conversa iniciada'}
            </span>
            {contact.unread_count > 0 && (
              <Badge variant="default" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
                {contact.unread_count}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyList({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="px-5 py-12 text-center">
      <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function WhatsAppSidebar({
  directoryTab,
  searchQuery,
  chats,
  contacts,
  isLoadingChats,
  isLoadingContacts,
  isRefreshingChats,
  isRefreshingContacts,
  chatsError,
  contactsError,
  selectedThreadId,
  onDirectoryTabChange,
  onSearchChange,
  onSelectThread,
}: WhatsAppSidebarProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r bg-card">
      <Tabs
        value={directoryTab}
        onValueChange={(value) => onDirectoryTabChange(value as 'chats' | 'contacts')}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b p-3">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={directoryTab === 'chats' ? 'Buscar conversa...' : 'Buscar contato...'}
                className="pl-9"
              />
            </div>

            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chats" className="text-xs">
                Conversas
                <Badge variant="secondary" className="ml-2 h-5 min-w-5 justify-center px-1.5 text-[10px]">
                  {chats.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="contacts" className="text-xs">
                Contatos
                <Badge variant="secondary" className="ml-2 h-5 min-w-5 justify-center px-1.5 text-[10px]">
                  {contacts.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {directoryTab === 'chats'
                  ? `${chats.length} ${chats.length === 1 ? 'conversa' : 'conversas'}`
                  : `${contacts.length} ${contacts.length === 1 ? 'contato' : 'contatos'}`}
              </span>
              {(directoryTab === 'chats' ? isRefreshingChats : isRefreshingContacts) && (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="h-3.5 w-3.5" />
                  Sincronizando...
                </span>
              )}
            </div>
          </div>
        </div>

        <TabsContent value="chats" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <ScrollArea className="min-h-0 flex-1" preventContentOverflow>
              {isLoadingChats ? (
                <SidebarSkeleton />
              ) : chatsError ? (
                <SidebarError error={chatsError} title="Falha ao carregar as conversas" />
              ) : chats.length === 0 ? (
                <EmptyList
                  title="Nenhuma conversa encontrada"
                  description={searchQuery ? 'Ajuste a busca ou abra um contato na aba ao lado.' : 'As conversas vao aparecer assim que a Evolution retornar historico.'}
                />
              ) : (
                <div className="space-y-2 p-4">
                  {chats.map((chat) => (
                    <ChatRow
                      key={chat.id}
                      chat={chat}
                      isSelected={selectedThreadId === chat.id}
                      onSelect={() => onSelectThread(chat.id)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <ScrollArea className="min-h-0 flex-1" preventContentOverflow>
              {isLoadingContacts ? (
                <SidebarSkeleton />
              ) : contactsError ? (
                <SidebarError error={contactsError} title="Falha ao carregar os contatos" />
              ) : contacts.length === 0 ? (
                <EmptyList
                  title="Nenhum contato encontrado"
                  description={searchQuery ? 'Nenhum contato corresponde a esta busca.' : 'Os contatos sincronizados pela Evolution vao aparecer aqui.'}
                />
              ) : (
                <div className="space-y-2 p-4">
                  {contacts.map((contact) => (
                    <ContactRow
                      key={contact.id}
                      contact={contact}
                      isSelected={selectedThreadId === contact.id}
                      onSelect={() => onSelectThread(contact.id)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
