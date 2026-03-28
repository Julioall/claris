import { format, formatDistanceToNow, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type {
  WhatsAppChatListItem,
  WhatsAppContact,
  WhatsAppContactListItem,
  WhatsAppConversation,
  WhatsAppInstance,
  WhatsAppMessage,
  WhatsAppMessageType,
  WhatsAppSelectedThread,
} from '@/features/whatsapp/types';

function getTimestamp(value: string | null) {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function sortByRecentActivity<T extends { last_message_at: string | null; name: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const delta = getTimestamp(b.last_message_at) - getTimestamp(a.last_message_at);
    return delta || a.name.localeCompare(b.name);
  });
}

export function formatMessageTime(value: string | null) {
  if (!value) return '--:--';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--:--' : format(date, 'HH:mm');
}

export function formatDateDivider(value: string | null) {
  if (!value) return 'Sem data';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';

  return format(date, "EEEE, d 'de' MMMM", { locale: ptBR });
}

export function formatRelativeDate(value: string | null) {
  if (!value) return 'Sem atividade recente';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem atividade recente';

  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: ptBR,
  });
}

export function getInstancePhone(instance: WhatsAppInstance | null) {
  const phoneNumber = instance?.metadata?.phone_number;
  return typeof phoneNumber === 'string' && phoneNumber.trim()
    ? `+${phoneNumber.replace(/\D/g, '')}`
    : null;
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function getMessageTypeLabel(type: WhatsAppMessageType) {
  switch (type) {
    case 'image':
      return 'Imagem';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'document':
      return 'Documento';
    case 'sticker':
      return 'Figurinha';
    case 'contact':
      return 'Contato';
    case 'location':
      return 'Localizacao';
    default:
      return 'Mensagem';
  }
}

export function getRenderableMessageText(message: WhatsAppMessage) {
  if (message.type === 'text') return message.text;
  if (message.media?.caption?.trim()) return message.media.caption.trim();
  if (message.contact?.display_name?.trim()) return message.contact.display_name.trim();
  if (message.location?.name?.trim()) return message.location.name.trim();

  return message.text === getMessageTypeLabel(message.type) ? null : message.text;
}

export function formatFileSize(value: number | null) {
  if (!value || value <= 0) return 'Arquivo';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function mergeChatsWithContacts(
  conversations: WhatsAppConversation[],
  contacts: WhatsAppContact[],
): WhatsAppChatListItem[] {
  const contactMap = new Map(contacts.map((contact) => [contact.remote_jid, contact]));

  const entries = conversations.map<WhatsAppChatListItem>((conversation) => {
    const contact = contactMap.get(conversation.remote_jid);

    return {
      ...conversation,
      name: contact?.name ?? conversation.name,
      phone: contact?.phone ?? conversation.phone,
      profile_picture_url: contact?.profile_picture_url ?? conversation.profile_picture_url,
      short_name: contact?.short_name ?? contact?.name ?? conversation.name,
      source: 'chat',
      contact_id: contact?.id ?? null,
    };
  });

  return sortByRecentActivity(entries);
}

export function buildContactList(
  contacts: WhatsAppContact[],
  chatEntries: WhatsAppChatListItem[],
): WhatsAppContactListItem[] {
  const chatMap = new Map(chatEntries.map((chat) => [chat.remote_jid, chat]));

  return contacts
    .map<WhatsAppContactListItem>((contact) => {
      const chat = chatMap.get(contact.remote_jid);

      return {
        ...contact,
        source: 'contact',
        has_chat: !!chat,
        unread_count: chat?.unread_count ?? 0,
        last_message_text: chat?.last_message_text ?? '',
        last_message_at: chat?.last_message_at ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findSelectedThread(
  selectedThreadId: string | null,
  chatEntries: WhatsAppChatListItem[],
  contactEntries: WhatsAppContactListItem[],
): WhatsAppSelectedThread | null {
  if (!selectedThreadId) return null;

  const fromChat = chatEntries.find((item) => item.id === selectedThreadId);
  if (fromChat) {
    return {
      id: fromChat.id,
      remote_jid: fromChat.remote_jid,
      name: fromChat.name,
      short_name: fromChat.short_name,
      phone: fromChat.phone,
      is_group: fromChat.is_group,
      profile_picture_url: fromChat.profile_picture_url,
      source: 'chat',
      has_chat: true,
      last_message_at: fromChat.last_message_at,
      unread_count: fromChat.unread_count,
    };
  }

  const fromContact = contactEntries.find((item) => item.id === selectedThreadId);
  if (!fromContact) return null;

  return {
    id: fromContact.id,
    remote_jid: fromContact.remote_jid,
    name: fromContact.name,
    short_name: fromContact.short_name,
    phone: fromContact.phone,
    is_group: false,
    profile_picture_url: fromContact.profile_picture_url,
    source: 'contact',
    has_chat: fromContact.has_chat,
    last_message_at: fromContact.last_message_at,
    unread_count: fromContact.unread_count,
  };
}

export function filterDirectoryEntries<T extends { name: string; phone: string | null; remote_jid: string }>(
  entries: T[],
  query: string,
) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;

  return entries.filter((entry) => (
    entry.name.toLowerCase().includes(normalized)
    || (entry.phone ?? '').toLowerCase().includes(normalized)
    || entry.remote_jid.toLowerCase().includes(normalized)
  ));
}

export function buildMessageGroups(messages: WhatsAppMessage[]) {
  const groups: Array<
    | { type: 'date'; id: string; label: string }
    | { type: 'message'; id: string; message: WhatsAppMessage }
  > = [];

  messages.forEach((message, index) => {
    const previous = messages[index - 1];

    if (!previous || !previous.sent_at || !message.sent_at || !isSameDay(new Date(previous.sent_at), new Date(message.sent_at))) {
      groups.push({
        type: 'date',
        id: `date:${message.sent_at ?? message.id}`,
        label: formatDateDivider(message.sent_at),
      });
    }

    groups.push({
      type: 'message',
      id: message.id,
      message,
    });
  });

  return groups;
}
