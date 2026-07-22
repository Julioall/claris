import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import type {
  MoodleConversationDto,
  MoodleConversationsDto,
  MoodleMessageDto,
  MoodleMessagesDto,
  MoodleMessageSentDto,
} from './contracts/moodle-messaging.contract';

const FUNCTION_NAME = 'moodle-messaging';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isConversation(value: unknown): value is MoodleConversationDto {
  if (!isRecord(value) || !isRecord(value.member)) return false;
  const lastMessage = value.lastMessage;

  return isFiniteNumber(value.id)
    && isFiniteNumber(value.member.id)
    && typeof value.member.fullName === 'string'
    && (value.member.profileImageUrl === null || typeof value.member.profileImageUrl === 'string')
    && (value.studentId === null || typeof value.studentId === 'string')
    && isFiniteNumber(value.unreadCount)
    && (
      lastMessage === null
      || (
        isRecord(lastMessage)
        && typeof lastMessage.text === 'string'
        && isFiniteNumber(lastMessage.createdAtUnix)
      )
    );
}

function isMessage(value: unknown): value is MoodleMessageDto {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.text === 'string'
    && isFiniteNumber(value.createdAtUnix)
    && isFiniteNumber(value.senderMoodleUserId)
    && (value.senderType === 'student' || value.senderType === 'tutor');
}

function invalidResponse(): never {
  throw new Error('A API de mensagens do Moodle retornou uma resposta invalida.');
}

export async function fetchMoodleConversations(connectionId: string): Promise<MoodleConversationsDto> {
  const response = await invokeEdgeFunction<MoodleConversationsDto>(FUNCTION_NAME, {
    body: { action: 'get_conversations', connectionId },
  });

  if (
    !isRecord(response)
    || response.contractVersion !== 1
    || !isFiniteNumber(response.currentMoodleUserId)
    || !Array.isArray(response.items)
    || !response.items.every(isConversation)
  ) {
    invalidResponse();
  }

  return response;
}

export async function fetchMoodleMessages(
  connectionId: string,
  moodleUserId: number,
  limit = 50,
): Promise<MoodleMessagesDto> {
  const response = await invokeEdgeFunction<MoodleMessagesDto>(FUNCTION_NAME, {
    body: { action: 'get_messages', connectionId, moodleUserId, limit },
  });

  if (
    !isRecord(response)
    || response.contractVersion !== 1
    || !isFiniteNumber(response.currentMoodleUserId)
    || (response.conversationId !== null && !isFiniteNumber(response.conversationId))
    || !Array.isArray(response.items)
    || !response.items.every(isMessage)
  ) {
    invalidResponse();
  }

  return response;
}

export async function sendMoodleMessage(
  connectionId: string,
  moodleUserId: number,
  message: string,
): Promise<MoodleMessageSentDto> {
  const response = await invokeEdgeFunction<MoodleMessageSentDto>(FUNCTION_NAME, {
    body: { action: 'send_message', connectionId, moodleUserId, message },
  });

  if (
    !isRecord(response)
    || response.contractVersion !== 1
    || (response.messageId !== null && typeof response.messageId !== 'string')
  ) {
    invalidResponse();
  }

  return response;
}
