import type { Json } from '../_shared/db/mod.ts'

export const CLARIS_CONVERSATIONS_CONTRACT_VERSION = 1 as const

export interface ClarisConversationMessageDto {
  content: string
  richBlocks?: Json[]
  role: 'assistant' | 'user'
}

export interface ClarisConversationDto {
  id: string
  lastContextRoute: string | null
  messages: ClarisConversationMessageDto[]
  title: string
  updatedAt: string
}

export interface ClarisConversationsListDto {
  contractVersion: typeof CLARIS_CONVERSATIONS_CONTRACT_VERSION
  items: ClarisConversationDto[]
}

export interface ClarisConversationCommandDto {
  contractVersion: typeof CLARIS_CONVERSATIONS_CONTRACT_VERSION
  conversation: ClarisConversationDto
}

export interface ClarisConversationDeleteDto {
  contractVersion: typeof CLARIS_CONVERSATIONS_CONTRACT_VERSION
  deleted: true
}

export type ClarisConversationsResponseDto =
  | ClarisConversationsListDto
  | ClarisConversationCommandDto
  | ClarisConversationDeleteDto
