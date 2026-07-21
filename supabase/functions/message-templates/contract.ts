export const MESSAGE_TEMPLATES_CONTRACT_VERSION = 1 as const

export interface MessageTemplatesMetadataDto {
  contractVersion: typeof MESSAGE_TEMPLATES_CONTRACT_VERSION
  generatedAt: string
}

export interface MessageTemplateDto {
  category: string | null
  content: string
  createdAt: string
  defaultKey: string | null
  id: string
  isDefault: boolean
  isFavorite: boolean
  title: string
  updatedAt: string
}

export interface MessageTemplatesListDto {
  items: MessageTemplateDto[]
  metadata: MessageTemplatesMetadataDto
}

export interface MessageTemplateMutationDto {
  metadata: MessageTemplatesMetadataDto
  template: MessageTemplateDto
}

export interface MessageTemplateDeleteDto {
  deleted: boolean
  metadata: MessageTemplatesMetadataDto
}
