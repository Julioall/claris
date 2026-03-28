export type WhatsAppMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'error';

export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'contact'
  | 'location'
  | 'unknown';

export interface WhatsAppInstance {
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

export interface WhatsAppContact {
  id: string;
  remote_jid: string;
  name: string;
  short_name: string;
  phone: string | null;
  profile_picture_url: string | null;
  is_business: boolean;
  updated_at: string | null;
}

export interface WhatsAppConversation {
  id: string;
  remote_jid: string;
  name: string;
  phone: string | null;
  unread_count: number;
  last_message_text: string;
  last_message_at: string | null;
  is_group: boolean;
  profile_picture_url: string | null;
}

export interface WhatsAppMessageMedia {
  media_type: Exclude<WhatsAppMessageType, 'text' | 'contact' | 'location' | 'unknown'>;
  mime_type: string | null;
  file_name: string | null;
  caption: string | null;
  url: string | null;
  direct_path: string | null;
  preview_data_url: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  is_voice_note: boolean;
  is_animated: boolean;
  requires_resolve: boolean;
}

export interface WhatsAppMessageContactCard {
  display_name: string | null;
  phone_numbers: string[];
  emails: string[];
  urls: string[];
  organization: string | null;
  vcard: string | null;
}

export interface WhatsAppMessageLocation {
  latitude: number | null;
  longitude: number | null;
  name: string | null;
  address: string | null;
  url: string | null;
}

export interface WhatsAppMessage {
  id: string;
  remote_jid: string;
  text: string;
  sent_at: string | null;
  direction: 'incoming' | 'outgoing';
  status?: WhatsAppMessageStatus;
  type: WhatsAppMessageType;
  media: WhatsAppMessageMedia | null;
  contact: WhatsAppMessageContactCard | null;
  location: WhatsAppMessageLocation | null;
  sender_name: string | null;
}

export interface WhatsAppResolvedMedia {
  message_id: string;
  base64: string | null;
  data_url: string | null;
  mime_type: string | null;
  file_name: string | null;
  media_type: Exclude<WhatsAppMessageType, 'text' | 'contact' | 'location' | 'unknown'>;
}

export interface WhatsAppChatListItem extends WhatsAppConversation {
  source: 'chat';
  contact_id: string | null;
  short_name: string;
}

export interface WhatsAppContactListItem extends WhatsAppContact {
  source: 'contact';
  has_chat: boolean;
  unread_count: number;
  last_message_text: string;
  last_message_at: string | null;
}

export interface WhatsAppSelectedThread {
  id: string;
  remote_jid: string;
  name: string;
  short_name: string;
  phone: string | null;
  is_group: boolean;
  profile_picture_url: string | null;
  source: 'chat' | 'contact';
  has_chat: boolean;
  last_message_at: string | null;
  unread_count: number;
}

export type DraftAttachmentKind = 'image' | 'video' | 'audio' | 'document';

export interface DraftAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  size: number;
  base64: string;
  preview_url: string | null;
  data_url: string | null;
  kind: DraftAttachmentKind;
  can_send_as_sticker: boolean;
  send_as_sticker: boolean;
}
