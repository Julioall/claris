import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import type {
  ClarisConversationCommandDto,
  ClarisConversationDto,
  ClarisConversationMessageDto,
  ClarisConversationsListDto,
} from './contracts/claris-conversations.contract';

const FUNCTION_NAME = 'claris-conversations';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMessage(value: unknown): value is ClarisConversationMessageDto {
  return isRecord(value)
    && (value.role === 'assistant' || value.role === 'user')
    && typeof value.content === 'string'
    && (value.richBlocks === undefined || Array.isArray(value.richBlocks));
}

function isConversation(value: unknown): value is ClarisConversationDto {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.updatedAt === 'string'
    && (value.lastContextRoute === null || typeof value.lastContextRoute === 'string')
    && Array.isArray(value.messages)
    && value.messages.every(isMessage);
}

function invalidResponse(): never {
  throw new Error('A API de conversas da Claris retornou uma resposta invalida.');
}

function readCommand(value: unknown): ClarisConversationDto {
  if (!isRecord(value) || value.contractVersion !== 1 || !isConversation(value.conversation)) {
    invalidResponse();
  }
  return value.conversation;
}

export async function fetchClarisConversations(limit = 30): Promise<ClarisConversationDto[]> {
  const response = await invokeEdgeFunction<ClarisConversationsListDto>(FUNCTION_NAME, {
    body: { action: 'list', limit },
  });
  if (
    !isRecord(response)
    || response.contractVersion !== 1
    || !Array.isArray(response.items)
    || !response.items.every(isConversation)
  ) {
    invalidResponse();
  }
  return response.items;
}

export async function createClarisConversation(
  title: string,
  messages: ClarisConversationMessageDto[],
  lastContextRoute: string | null,
): Promise<ClarisConversationDto> {
  return readCommand(await invokeEdgeFunction<ClarisConversationCommandDto>(FUNCTION_NAME, {
    body: { action: 'create', title, messages, lastContextRoute },
  }));
}

export async function updateClarisConversation(
  conversationId: string,
  fields: {
    lastContextRoute?: string | null;
    messages?: ClarisConversationMessageDto[];
    title?: string;
  },
): Promise<ClarisConversationDto> {
  return readCommand(await invokeEdgeFunction<ClarisConversationCommandDto>(FUNCTION_NAME, {
    body: { action: 'update', conversationId, ...fields },
  }));
}

export async function deleteClarisConversation(conversationId: string): Promise<void> {
  const response = await invokeEdgeFunction<{ contractVersion: 1; deleted: true }>(FUNCTION_NAME, {
    body: { action: 'delete', conversationId },
  });
  if (!isRecord(response) || response.contractVersion !== 1 || response.deleted !== true) {
    invalidResponse();
  }
}
