import { userHasPermission as checkPermission } from '../_shared/auth/mod.ts'
import { createServiceClient, type AppSupabaseClient } from '../_shared/db/mod.ts'
import { DEFAULT_MESSAGE_TEMPLATES } from '../_shared/domain/message-templates/defaults.ts'

export interface MessageTemplateRecord {
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

export interface MessageTemplatesRepository {
  create(actorId: string, input: { category: string; content: string; title: string }): Promise<MessageTemplateRecord>
  delete(actorId: string, templateId: string): Promise<boolean>
  ensureDefaults(actorId: string): Promise<void>
  list(actorId: string, optionsOnly: boolean): Promise<MessageTemplateRecord[]>
  setFavorite(actorId: string, templateId: string, isFavorite: boolean): Promise<MessageTemplateRecord | null>
  update(actorId: string, templateId: string, input: { category: string; content: string; title: string }): Promise<MessageTemplateRecord | null>
  userHasPermission(actorId: string, permission: string): Promise<boolean>
}

type TemplateRow = {
  category: string | null
  content: string
  created_at: string
  default_key: string | null
  id: string
  is_default: boolean
  is_favorite: boolean | null
  title: string
  updated_at: string
}

const TEMPLATE_COLUMNS = 'id, title, content, category, is_favorite, is_default, default_key, created_at, updated_at'

function toRecord(row: TemplateRow): MessageTemplateRecord {
  return {
    category: row.category,
    content: row.content,
    createdAt: row.created_at,
    defaultKey: row.default_key,
    id: row.id,
    isDefault: row.is_default,
    isFavorite: row.is_favorite === true,
    title: row.title,
    updatedAt: row.updated_at,
  }
}

export function createMessageTemplatesRepository(
  db: AppSupabaseClient = createServiceClient(),
): MessageTemplatesRepository {
  return {
    userHasPermission: (actorId, permission) => checkPermission(db, actorId, permission),

    async ensureDefaults(actorId) {
      const defaults = DEFAULT_MESSAGE_TEMPLATES.map((template) => ({
        category: template.category,
        content: template.content,
        default_key: template.defaultKey,
        title: template.title,
      }))
      const { error } = await db.rpc('backend_seed_message_templates' as never, {
        p_actor_id: actorId,
        p_defaults: defaults,
      } as never)
      if (error) throw error
    },

    async list(actorId, optionsOnly) {
      let query = db
        .from('message_templates')
        .select(TEMPLATE_COLUMNS)
        .eq('user_id', actorId)
        .order('is_favorite', { ascending: false })
      query = optionsOnly
        ? query.order('title').order('id')
        : query.order('updated_at', { ascending: false }).order('id')
      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map((row) => toRecord(row as TemplateRow))
    },

    async create(actorId, input) {
      const { data, error } = await db
        .from('message_templates')
        .insert({ ...input, user_id: actorId })
        .select(TEMPLATE_COLUMNS)
        .single()
      if (error) throw error
      return toRecord(data as TemplateRow)
    },

    async update(actorId, templateId, input) {
      const { data, error } = await db
        .from('message_templates')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', templateId)
        .eq('user_id', actorId)
        .select(TEMPLATE_COLUMNS)
        .maybeSingle()
      if (error) throw error
      return data ? toRecord(data as TemplateRow) : null
    },

    async delete(actorId, templateId) {
      const { data, error } = await db
        .from('message_templates')
        .delete()
        .eq('id', templateId)
        .eq('user_id', actorId)
        .select('id')
        .maybeSingle()
      if (error) throw error
      return Boolean(data)
    },

    async setFavorite(actorId, templateId, isFavorite) {
      const { data, error } = await db
        .from('message_templates')
        .update({ is_favorite: isFavorite, updated_at: new Date().toISOString() })
        .eq('id', templateId)
        .eq('user_id', actorId)
        .select(TEMPLATE_COLUMNS)
        .maybeSingle()
      if (error) throw error
      return data ? toRecord(data as TemplateRow) : null
    },
  }
}
