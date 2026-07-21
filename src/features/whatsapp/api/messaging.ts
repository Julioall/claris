import {
  ApiClientError,
  invokeEdgeFunction,
  invokeEdgeFunctionWithUploadProgress,
} from '@/integrations/http/edge-function-client';
import type {
  WhatsAppContactDto,
  WhatsAppConversationDto,
  WhatsAppInstanceDto,
  WhatsAppMessageDto,
  WhatsAppMessageMediaDto,
  WhatsAppMessageMutationDto,
  WhatsAppMessagesDto,
  WhatsAppMetadataDto,
  WhatsAppResolvedMediaDto,
  WhatsAppResolvedMediaResultDto,
} from './contracts/whatsapp-messaging.contract';
import { WHATSAPP_MESSAGING_CONTRACT_VERSION } from './contracts/whatsapp-messaging.contract';
import {
  mapWhatsAppContact,
  mapWhatsAppConversation,
  mapWhatsAppInstance,
  mapWhatsAppMessage,
  mapWhatsAppResolvedMedia,
} from './mappers/whatsapp-messaging.mapper';
import type {
  DraftAttachmentKind,
  WhatsAppContact,
  WhatsAppConversation,
  WhatsAppInstance,
  WhatsAppMessage,
  WhatsAppResolvedMedia,
} from '../types';

interface SendWhatsAppMessageInput {
  instanceId: string;
  message: string;
  remoteJid: string;
}

interface SendWhatsAppMediaInput {
  caption?: string;
  fileName: string;
  instanceId: string;
  media: string;
  mediaType: DraftAttachmentKind;
  mimeType: string;
  remoteJid: string;
  sendAsSticker: boolean;
}

interface ResolveWhatsAppMediaInput {
  convertToMp4?: boolean;
  fileName?: string | null;
  instanceId: string;
  messageId: string;
  mimeType?: string | null;
  remoteJid: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function nullableRecord(value: unknown): value is Record<string, unknown> | null {
  return value === null || asRecord(value) !== null;
}

function invalidResponse(): never {
  throw new ApiClientError({
    code: 'invalid_response',
    message: 'A API do WhatsApp retornou uma resposta invalida.',
  });
}

function isMetadata(value: unknown): value is WhatsAppMetadataDto {
  const metadata = asRecord(value);
  return Boolean(
    metadata
    && metadata.contractVersion === WHATSAPP_MESSAGING_CONTRACT_VERSION
    && typeof metadata.generatedAt === 'string',
  );
}

function isInstance(value: unknown): value is WhatsAppInstanceDto {
  const instance = asRecord(value);
  return Boolean(
    instance
    && typeof instance.id === 'string'
    && typeof instance.name === 'string'
    && (instance.scope === 'personal' || instance.scope === 'shared')
    && typeof instance.connectionStatus === 'string'
    && typeof instance.isActive === 'boolean'
    && typeof instance.isBlocked === 'boolean'
    && nullableString(instance.lastActivityAt)
    && typeof instance.createdAt === 'string'
    && nullableRecord(instance.metadata),
  );
}

function isContact(value: unknown): value is WhatsAppContactDto {
  const contact = asRecord(value);
  return Boolean(
    contact
    && typeof contact.id === 'string'
    && typeof contact.remoteJid === 'string'
    && typeof contact.name === 'string'
    && typeof contact.shortName === 'string'
    && nullableString(contact.phone)
    && nullableString(contact.profilePictureUrl)
    && typeof contact.isBusiness === 'boolean'
    && nullableString(contact.updatedAt),
  );
}

function isConversation(value: unknown): value is WhatsAppConversationDto {
  const conversation = asRecord(value);
  return Boolean(
    conversation
    && typeof conversation.id === 'string'
    && typeof conversation.remoteJid === 'string'
    && typeof conversation.name === 'string'
    && nullableString(conversation.phone)
    && Number.isSafeInteger(conversation.unreadCount)
    && typeof conversation.lastMessageText === 'string'
    && nullableString(conversation.lastMessageAt)
    && typeof conversation.isGroup === 'boolean'
    && nullableString(conversation.profilePictureUrl),
  );
}

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'] as const;
const MESSAGE_TYPES = ['text', ...MEDIA_TYPES, 'contact', 'location', 'unknown'] as const;
const MESSAGE_STATUSES = ['pending', 'sent', 'delivered', 'read', 'error'] as const;

function isMedia(value: unknown): value is WhatsAppMessageMediaDto {
  const media = asRecord(value);
  return Boolean(
    media
    && MEDIA_TYPES.includes(media.mediaType as typeof MEDIA_TYPES[number])
    && nullableString(media.mimeType)
    && nullableString(media.fileName)
    && nullableString(media.caption)
    && nullableString(media.url)
    && nullableString(media.directPath)
    && nullableString(media.previewDataUrl)
    && nullableNumber(media.fileSizeBytes)
    && nullableNumber(media.durationSeconds)
    && nullableNumber(media.width)
    && nullableNumber(media.height)
    && typeof media.isVoiceNote === 'boolean'
    && typeof media.isAnimated === 'boolean'
    && typeof media.requiresResolve === 'boolean',
  );
}

function isContactCard(value: unknown): boolean {
  const card = asRecord(value);
  return Boolean(
    card
    && nullableString(card.displayName)
    && Array.isArray(card.phoneNumbers) && card.phoneNumbers.every((entry) => typeof entry === 'string')
    && Array.isArray(card.emails) && card.emails.every((entry) => typeof entry === 'string')
    && Array.isArray(card.urls) && card.urls.every((entry) => typeof entry === 'string')
    && nullableString(card.organization)
    && nullableString(card.vcard),
  );
}

function isLocation(value: unknown): boolean {
  const location = asRecord(value);
  return Boolean(
    location
    && nullableNumber(location.latitude)
    && nullableNumber(location.longitude)
    && nullableString(location.name)
    && nullableString(location.address)
    && nullableString(location.url),
  );
}

function isMessage(value: unknown): value is WhatsAppMessageDto {
  const message = asRecord(value);
  return Boolean(
    message
    && typeof message.id === 'string'
    && typeof message.remoteJid === 'string'
    && typeof message.text === 'string'
    && nullableString(message.sentAt)
    && (message.direction === 'incoming' || message.direction === 'outgoing')
    && (message.status === undefined || MESSAGE_STATUSES.includes(message.status as typeof MESSAGE_STATUSES[number]))
    && MESSAGE_TYPES.includes(message.type as typeof MESSAGE_TYPES[number])
    && (message.media === null || isMedia(message.media))
    && (message.contact === null || isContactCard(message.contact))
    && (message.location === null || isLocation(message.location))
    && nullableString(message.senderName),
  );
}

function isResolvedMedia(value: unknown): value is WhatsAppResolvedMediaDto {
  const media = asRecord(value);
  return Boolean(
    media
    && typeof media.messageId === 'string'
    && nullableString(media.base64)
    && nullableString(media.dataUrl)
    && nullableString(media.mimeType)
    && nullableString(media.fileName)
    && MEDIA_TYPES.includes(media.mediaType as typeof MEDIA_TYPES[number]),
  );
}

function parseList<T>(
  value: unknown,
  field: string,
  validator: (entry: unknown) => entry is T,
): { items: T[]; metadata: WhatsAppMetadataDto } {
  const response = asRecord(value);
  const items = response?.[field];
  if (!response || !Array.isArray(items) || !items.every(validator) || !isMetadata(response.metadata)) {
    invalidResponse();
  }
  return { items: items as T[], metadata: response.metadata };
}

function parseMessageMutation(value: unknown): WhatsAppMessageMutationDto {
  const response = asRecord(value);
  if (!response || !isMessage(response.message) || !isMetadata(response.metadata)) invalidResponse();
  return response as unknown as WhatsAppMessageMutationDto;
}

export async function fetchActiveWhatsAppInstances(): Promise<WhatsAppInstance[]> {
  const response = await invokeEdgeFunction<unknown>('whatsapp-messaging', {
    auth: 'required',
    body: { action: 'list_instances' },
  });
  const parsed = parseList<WhatsAppInstanceDto>(response, 'instances', isInstance);
  return parsed.items.map(mapWhatsAppInstance);
}

export async function fetchWhatsAppContacts(instanceId: string): Promise<WhatsAppContact[]> {
  const response = await invokeEdgeFunction<unknown>('whatsapp-messaging', {
    auth: 'required',
    body: { action: 'get_contacts', instanceId },
  });
  const parsed = parseList<WhatsAppContactDto>(response, 'contacts', isContact);
  return parsed.items.map(mapWhatsAppContact);
}

export async function fetchWhatsAppConversations(instanceId: string): Promise<WhatsAppConversation[]> {
  const response = await invokeEdgeFunction<unknown>('whatsapp-messaging', {
    auth: 'required',
    body: { action: 'get_chats', instanceId },
  });
  const parsed = parseList<WhatsAppConversationDto>(response, 'conversations', isConversation);
  return parsed.items.map(mapWhatsAppConversation);
}

export async function fetchWhatsAppMessages(
  instanceId: string,
  remoteJid: string,
  limit = 120,
): Promise<WhatsAppMessage[]> {
  const value = await invokeEdgeFunction<unknown>('whatsapp-messaging', {
    auth: 'required',
    body: { action: 'get_messages', instanceId, limit, remoteJid },
  });
  const response = asRecord(value);
  if (!(
    response
    && typeof response.remoteJid === 'string'
    && Array.isArray(response.messages)
    && response.messages.every(isMessage)
    && isMetadata(response.metadata)
  )) invalidResponse();
  const parsed = response as unknown as WhatsAppMessagesDto;
  return parsed.messages.map(mapWhatsAppMessage);
}

export async function sendWhatsAppMessage(input: SendWhatsAppMessageInput): Promise<WhatsAppMessage> {
  const response = await invokeEdgeFunction<unknown>('whatsapp-messaging', {
    auth: 'required',
    body: { action: 'send_message', ...input },
    timeoutMs: 60_000,
  });
  return mapWhatsAppMessage(parseMessageMutation(response).message);
}

export async function sendWhatsAppMedia(
  input: SendWhatsAppMediaInput,
  onProgress?: (progress: number) => void,
): Promise<WhatsAppMessage> {
  const action = input.sendAsSticker ? 'send_sticker' : 'send_media';
  const response = await invokeEdgeFunctionWithUploadProgress<unknown>('whatsapp-messaging', {
    auth: 'required',
    body: {
      action,
      fileName: input.fileName,
      instanceId: input.instanceId,
      media: input.media,
      mimeType: input.mimeType,
      remoteJid: input.remoteJid,
      ...(input.sendAsSticker ? {} : {
        caption: input.caption,
        mediaType: input.mediaType,
      }),
    },
    onUploadProgress: (progress) => onProgress?.(Math.min(95, 35 + Math.round(progress * 0.6))),
    timeoutMs: 120_000,
  });
  onProgress?.(100);
  return mapWhatsAppMessage(parseMessageMutation(response).message);
}

export async function resolveWhatsAppMedia(
  input: ResolveWhatsAppMediaInput,
): Promise<WhatsAppResolvedMedia | null> {
  const value = await invokeEdgeFunction<unknown>('whatsapp-messaging', {
    auth: 'required',
    body: {
      action: 'resolve_media',
      convertToMp4: input.convertToMp4,
      fileName: input.fileName ?? undefined,
      instanceId: input.instanceId,
      messageId: input.messageId,
      mimeType: input.mimeType ?? undefined,
      remoteJid: input.remoteJid,
    },
    timeoutMs: 60_000,
  });
  const response = asRecord(value);
  if (!response || !isMetadata(response.metadata) || !(response.media === null || isResolvedMedia(response.media))) {
    invalidResponse();
  }
  const parsed = response as unknown as WhatsAppResolvedMediaResultDto;
  return parsed.media ? mapWhatsAppResolvedMedia(parsed.media) : null;
}
