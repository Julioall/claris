import type {
  WhatsAppContactDto,
  WhatsAppConversationDto,
  WhatsAppInstanceDto,
  WhatsAppMessageDto,
  WhatsAppMessageMediaDto,
  WhatsAppResolvedMediaDto,
} from '../contracts/whatsapp-messaging.contract';
import type {
  WhatsAppContact,
  WhatsAppConversation,
  WhatsAppInstance,
  WhatsAppMessage,
  WhatsAppMessageMedia,
  WhatsAppResolvedMedia,
} from '../../types';

function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function snakeCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeCase);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [snakeKey(key), snakeCase(entry)]),
  );
}

export function mapWhatsAppInstance(dto: WhatsAppInstanceDto): WhatsAppInstance {
  return {
    id: dto.id,
    name: dto.name,
    scope: dto.scope,
    connection_status: dto.connectionStatus,
    is_active: dto.isActive,
    is_blocked: dto.isBlocked,
    last_activity_at: dto.lastActivityAt,
    created_at: dto.createdAt,
    metadata: dto.metadata ? snakeCase(dto.metadata) as Record<string, unknown> : null,
  };
}

export function mapWhatsAppContact(dto: WhatsAppContactDto): WhatsAppContact {
  return {
    id: dto.id,
    remote_jid: dto.remoteJid,
    name: dto.name,
    short_name: dto.shortName,
    phone: dto.phone,
    profile_picture_url: dto.profilePictureUrl,
    is_business: dto.isBusiness,
    updated_at: dto.updatedAt,
  };
}

export function mapWhatsAppConversation(dto: WhatsAppConversationDto): WhatsAppConversation {
  return {
    id: dto.id,
    remote_jid: dto.remoteJid,
    name: dto.name,
    phone: dto.phone,
    unread_count: dto.unreadCount,
    last_message_text: dto.lastMessageText,
    last_message_at: dto.lastMessageAt,
    is_group: dto.isGroup,
    profile_picture_url: dto.profilePictureUrl,
  };
}

function mapWhatsAppMessageMedia(dto: WhatsAppMessageMediaDto): WhatsAppMessageMedia {
  return {
    media_type: dto.mediaType,
    mime_type: dto.mimeType,
    file_name: dto.fileName,
    caption: dto.caption,
    url: dto.url,
    direct_path: dto.directPath,
    preview_data_url: dto.previewDataUrl,
    file_size_bytes: dto.fileSizeBytes,
    duration_seconds: dto.durationSeconds,
    width: dto.width,
    height: dto.height,
    is_voice_note: dto.isVoiceNote,
    is_animated: dto.isAnimated,
    requires_resolve: dto.requiresResolve,
  };
}

export function mapWhatsAppMessage(dto: WhatsAppMessageDto): WhatsAppMessage {
  return {
    id: dto.id,
    remote_jid: dto.remoteJid,
    text: dto.text,
    sent_at: dto.sentAt,
    direction: dto.direction,
    ...(dto.status ? { status: dto.status } : {}),
    type: dto.type,
    media: dto.media ? mapWhatsAppMessageMedia(dto.media) : null,
    contact: dto.contact ? {
      display_name: dto.contact.displayName,
      phone_numbers: dto.contact.phoneNumbers,
      emails: dto.contact.emails,
      urls: dto.contact.urls,
      organization: dto.contact.organization,
      vcard: dto.contact.vcard,
    } : null,
    location: dto.location ? {
      latitude: dto.location.latitude,
      longitude: dto.location.longitude,
      name: dto.location.name,
      address: dto.location.address,
      url: dto.location.url,
    } : null,
    sender_name: dto.senderName,
  };
}

export function mapWhatsAppResolvedMedia(dto: WhatsAppResolvedMediaDto): WhatsAppResolvedMedia {
  return {
    message_id: dto.messageId,
    base64: dto.base64,
    data_url: dto.dataUrl,
    mime_type: dto.mimeType,
    file_name: dto.fileName,
    media_type: dto.mediaType,
  };
}
