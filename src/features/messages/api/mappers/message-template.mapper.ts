import type { MessageTemplateDto } from '../contracts/message-templates.contract';
import type { MessageTemplate, MessageTemplateOption } from '../../types';

export function mapMessageTemplateOption(dto: MessageTemplateDto): MessageTemplateOption {
  return {
    category: dto.category,
    content: dto.content,
    id: dto.id,
    is_favorite: dto.isFavorite,
    title: dto.title,
  };
}

export function mapMessageTemplate(dto: MessageTemplateDto): MessageTemplate {
  return {
    ...mapMessageTemplateOption(dto),
    created_at: dto.createdAt,
    updated_at: dto.updatedAt,
  };
}
