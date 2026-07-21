import { ApiError } from '../_shared/http/mod.ts'
import {
  MESSAGE_TEMPLATES_CONTRACT_VERSION,
  type MessageTemplateDeleteDto,
  type MessageTemplateDto,
  type MessageTemplateMutationDto,
  type MessageTemplatesListDto,
  type MessageTemplatesMetadataDto,
} from './contract.ts'
import type { MessageTemplatesPayload } from './payload.ts'
import type {
  MessageTemplateRecord,
  MessageTemplatesRepository,
} from './repository.ts'

export const MESSAGE_TEMPLATES_PERMISSION = 'messages.bulk_send'

function metadata(): MessageTemplatesMetadataDto {
  return {
    contractVersion: MESSAGE_TEMPLATES_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
  }
}

function toDto(template: MessageTemplateRecord): MessageTemplateDto {
  return { ...template }
}

export function authorizeMessageTemplates(
  repository: MessageTemplatesRepository,
  actorId: string,
  _payload: MessageTemplatesPayload,
): Promise<boolean> {
  return repository.userHasPermission(actorId, MESSAGE_TEMPLATES_PERMISSION)
}

export async function executeMessageTemplates(
  repository: MessageTemplatesRepository,
  actorId: string,
  payload: MessageTemplatesPayload,
): Promise<MessageTemplatesListDto | MessageTemplateMutationDto | MessageTemplateDeleteDto> {
  switch (payload.action) {
    case 'list_templates':
    case 'list_template_options': {
      await repository.ensureDefaults(actorId)
      const items = await repository.list(actorId, payload.action === 'list_template_options')
      return { items: items.map(toDto), metadata: metadata() }
    }
    case 'create_template': {
      const template = await repository.create(actorId, payload.input)
      return { metadata: metadata(), template: toDto(template) }
    }
    case 'update_template': {
      const template = await repository.update(actorId, payload.templateId, payload.input)
      if (!template) throw ApiError.notFound('Message template not found')
      return { metadata: metadata(), template: toDto(template) }
    }
    case 'delete_template': {
      const deleted = await repository.delete(actorId, payload.templateId)
      if (!deleted) throw ApiError.notFound('Message template not found')
      return { deleted: true, metadata: metadata() }
    }
    case 'set_favorite': {
      const template = await repository.setFavorite(actorId, payload.templateId, payload.isFavorite)
      if (!template) throw ApiError.notFound('Message template not found')
      return { metadata: metadata(), template: toDto(template) }
    }
  }
}
