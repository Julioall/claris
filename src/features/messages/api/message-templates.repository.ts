import { ApiClientError, invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import type { MessageTemplate, MessageTemplateOption } from '../types';
import {
  MESSAGE_TEMPLATES_CONTRACT_VERSION,
  type MessageTemplateDeleteDto,
  type MessageTemplateDto,
  type MessageTemplateMutationDto,
  type MessageTemplatesListDto,
  type MessageTemplatesMetadataDto,
} from './contracts/message-templates.contract';
import {
  mapMessageTemplate,
  mapMessageTemplateOption,
} from './mappers/message-template.mapper';

interface SaveMessageTemplateInput {
  category: string;
  content: string;
  title: string;
}

const MESSAGE_TEMPLATES_TIMEOUT_MS = 15_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function invalidResponse(): never {
  throw new ApiClientError({
    code: 'invalid_response',
    message: 'A API de modelos de mensagem retornou uma resposta invalida.',
  });
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isMetadata(value: unknown): value is MessageTemplatesMetadataDto {
  const metadata = asRecord(value);
  return Boolean(
    metadata
    && metadata.contractVersion === MESSAGE_TEMPLATES_CONTRACT_VERSION
    && typeof metadata.generatedAt === 'string',
  );
}

function isTemplate(value: unknown): value is MessageTemplateDto {
  const template = asRecord(value);
  return Boolean(
    template
    && typeof template.id === 'string'
    && typeof template.title === 'string'
    && typeof template.content === 'string'
    && nullableString(template.category)
    && typeof template.isFavorite === 'boolean'
    && typeof template.isDefault === 'boolean'
    && nullableString(template.defaultKey)
    && typeof template.createdAt === 'string'
    && typeof template.updatedAt === 'string',
  );
}

function parseList(value: unknown): MessageTemplatesListDto {
  const list = asRecord(value);
  if (!(list && Array.isArray(list.items) && list.items.every(isTemplate) && isMetadata(list.metadata))) {
    invalidResponse();
  }
  return list as unknown as MessageTemplatesListDto;
}

function parseMutation(value: unknown): MessageTemplateMutationDto {
  const mutation = asRecord(value);
  if (!(mutation && isTemplate(mutation.template) && isMetadata(mutation.metadata))) invalidResponse();
  return mutation as unknown as MessageTemplateMutationDto;
}

function parseDelete(value: unknown): MessageTemplateDeleteDto {
  const deletion = asRecord(value);
  if (!(deletion && deletion.deleted === true && isMetadata(deletion.metadata))) invalidResponse();
  return deletion as unknown as MessageTemplateDeleteDto;
}

async function invoke(body: Record<string, unknown>): Promise<unknown> {
  return invokeEdgeFunction('message-templates', {
    auth: 'required',
    body,
    timeoutMs: MESSAGE_TEMPLATES_TIMEOUT_MS,
  });
}

export async function listMessageTemplateOptionsForUser(): Promise<MessageTemplateOption[]> {
  const response = parseList(await invoke({ action: 'list_template_options' }));
  return response.items.map(mapMessageTemplateOption);
}

export async function listMessageTemplatesForUser(): Promise<MessageTemplate[]> {
  const response = parseList(await invoke({ action: 'list_templates' }));
  return response.items.map(mapMessageTemplate);
}

export async function createMessageTemplate(input: SaveMessageTemplateInput): Promise<void> {
  parseMutation(await invoke({ action: 'create_template', input }));
}

export async function updateMessageTemplate(
  templateId: string,
  input: SaveMessageTemplateInput,
): Promise<void> {
  parseMutation(await invoke({ action: 'update_template', input, templateId }));
}

export async function deleteMessageTemplate(templateId: string): Promise<void> {
  parseDelete(await invoke({ action: 'delete_template', templateId }));
}

export async function setMessageTemplateFavorite(
  templateId: string,
  isFavorite: boolean,
): Promise<void> {
  parseMutation(await invoke({ action: 'set_favorite', isFavorite, templateId }));
}
