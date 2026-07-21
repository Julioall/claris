import { userHasPermission as checkPermission } from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
  type Json,
} from '../_shared/db/mod.ts'
import type {
  ClarisConversationDto,
  ClarisConversationMessageDto,
} from './contract.ts'

type ConversationRow = {
  id: string
  last_context_route: string | null
  messages: Json
  title: string
  updated_at: string
}

export interface ClarisConversationsRepository {
  create(actorId: string, input: {
    lastContextRoute: string | null
    messages: ClarisConversationMessageDto[]
    title: string
  }): Promise<ClarisConversationDto>
  delete(actorId: string, conversationId: string): Promise<boolean>
  list(actorId: string, limit: number): Promise<ClarisConversationDto[]>
  update(actorId: string, conversationId: string, fields: {
    lastContextRoute?: string | null
    messages?: ClarisConversationMessageDto[]
    title?: string
  }): Promise<ClarisConversationDto | null>
  userCanUseClaris(actorId: string): Promise<boolean>
}

const COLUMNS = 'id, title, messages, updated_at, last_context_route'

function normalizeMessages(value: Json): ClarisConversationMessageDto[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const message = item as Record<string, Json | undefined>
    if (
      (message.role !== 'assistant' && message.role !== 'user')
      || typeof message.content !== 'string'
    ) {
      return []
    }
    return [{
      content: message.content,
      ...(Array.isArray(message.richBlocks) ? { richBlocks: message.richBlocks } : {}),
      role: message.role,
    }]
  })
}

function toDto(row: ConversationRow): ClarisConversationDto {
  return {
    id: row.id,
    lastContextRoute: row.last_context_route,
    messages: normalizeMessages(row.messages),
    title: row.title,
    updatedAt: row.updated_at,
  }
}

export function createClarisConversationsRepository(
  db: AppSupabaseClient = createServiceClient(),
): ClarisConversationsRepository {
  return {
    userCanUseClaris: (actorId) => checkPermission(db, actorId, 'claris.view'),

    async list(actorId, limit) {
      const { data, error } = await db
        .from('claris_conversations')
        .select(COLUMNS)
        .eq('user_id', actorId)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []).map((row) => toDto(row as ConversationRow))
    },

    async create(actorId, input) {
      const { data, error } = await db
        .from('claris_conversations')
        .insert({
          last_context_route: input.lastContextRoute,
          messages: input.messages as Json,
          title: input.title,
          user_id: actorId,
        })
        .select(COLUMNS)
        .single()
      if (error) throw error
      return toDto(data as ConversationRow)
    },

    async update(actorId, conversationId, fields) {
      const update = {
        ...('lastContextRoute' in fields ? { last_context_route: fields.lastContextRoute } : {}),
        ...('messages' in fields ? { messages: fields.messages as Json } : {}),
        ...('title' in fields ? { title: fields.title } : {}),
      }
      const { data, error } = await db
        .from('claris_conversations')
        .update(update)
        .eq('id', conversationId)
        .eq('user_id', actorId)
        .select(COLUMNS)
        .maybeSingle()
      if (error) throw error
      return data ? toDto(data as ConversationRow) : null
    },

    async delete(actorId, conversationId) {
      const { data, error } = await db
        .from('claris_conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', actorId)
        .select('id')
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },
  }
}
