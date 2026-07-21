export const WHATSAPP_MESSAGING_CONTRACT_VERSION = 1 as const;

export interface WhatsAppMetadataDto {
  contractVersion: typeof WHATSAPP_MESSAGING_CONTRACT_VERSION;
  generatedAt: string;
}

export interface WhatsAppInstanceDto {
  id: string;
  name: string;
  scope: 'personal' | 'shared';
  connectionStatus: string;
  isActive: boolean;
  isBlocked: boolean;
  lastActivityAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface WhatsAppContactDto {
  id: string;
  remoteJid: string;
  name: string;
  shortName: string;
  phone: string | null;
  profilePictureUrl: string | null;
  isBusiness: boolean;
  updatedAt: string | null;
}

export interface WhatsAppConversationDto {
  id: string;
  remoteJid: string;
  name: string;
  phone: string | null;
  unreadCount: number;
  lastMessageText: string;
  lastMessageAt: string | null;
  isGroup: boolean;
  profilePictureUrl: string | null;
}

export interface WhatsAppMessageMediaDto {
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  mimeType: string | null;
  fileName: string | null;
  caption: string | null;
  url: string | null;
  directPath: string | null;
  previewDataUrl: string | null;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  isVoiceNote: boolean;
  isAnimated: boolean;
  requiresResolve: boolean;
}

export interface WhatsAppMessageContactCardDto {
  displayName: string | null;
  phoneNumbers: string[];
  emails: string[];
  urls: string[];
  organization: string | null;
  vcard: string | null;
}

export interface WhatsAppMessageLocationDto {
  latitude: number | null;
  longitude: number | null;
  name: string | null;
  address: string | null;
  url: string | null;
}

export interface WhatsAppMessageDto {
  id: string;
  remoteJid: string;
  text: string;
  sentAt: string | null;
  direction: 'incoming' | 'outgoing';
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'error';
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'contact' | 'location' | 'unknown';
  media: WhatsAppMessageMediaDto | null;
  contact: WhatsAppMessageContactCardDto | null;
  location: WhatsAppMessageLocationDto | null;
  senderName: string | null;
}

export interface WhatsAppResolvedMediaDto {
  messageId: string;
  base64: string | null;
  dataUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
  mediaType: WhatsAppMessageMediaDto['mediaType'];
}

export interface WhatsAppInstancesDto {
  instances: WhatsAppInstanceDto[];
  metadata: WhatsAppMetadataDto;
}

export interface WhatsAppContactsDto {
  contacts: WhatsAppContactDto[];
  metadata: WhatsAppMetadataDto;
}

export interface WhatsAppConversationsDto {
  conversations: WhatsAppConversationDto[];
  metadata: WhatsAppMetadataDto;
}

export interface WhatsAppMessagesDto {
  messages: WhatsAppMessageDto[];
  metadata: WhatsAppMetadataDto;
  remoteJid: string;
}

export interface WhatsAppMessageMutationDto {
  message: WhatsAppMessageDto;
  metadata: WhatsAppMetadataDto;
}

export interface WhatsAppResolvedMediaResultDto {
  media: WhatsAppResolvedMediaDto | null;
  metadata: WhatsAppMetadataDto;
}
