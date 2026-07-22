import type {
  AppSupabaseClient,
  Json,
  Tables,
  TablesUpdate,
} from '../../db/mod.ts'

export type MoodleConnectionRecord = Tables<'user_moodle_connections'>
export type MoodleSiteRecord = Tables<'moodle_sites'>

export async function findOwnedMoodleConnection(
  supabase: AppSupabaseClient,
  userId: string,
  connectionId: string,
): Promise<MoodleConnectionRecord | null> {
  const { data, error } = await supabase
    .from('user_moodle_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function findMoodleSiteById(
  supabase: AppSupabaseClient,
  siteId: string,
): Promise<MoodleSiteRecord | null> {
  const { data, error } = await supabase
    .from('moodle_sites')
    .select('*')
    .eq('id', siteId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function updateConnection(
  supabase: AppSupabaseClient,
  connectionId: string,
  payload: TablesUpdate<'user_moodle_connections'>,
): Promise<void> {
  const { error } = await supabase
    .from('user_moodle_connections')
    .update(payload)
    .eq('id', connectionId)

  if (error) throw error
}

export async function markMoodleConnectionTokenIssued(
  supabase: AppSupabaseClient,
  connectionId: string,
  timestamp: string,
): Promise<void> {
  await updateConnection(supabase, connectionId, {
    last_error: null,
    last_reauth_at: timestamp,
    last_token_issued_at: timestamp,
    status: 'active',
  })
}

export async function markMoodleConnectionReauthRequired(
  supabase: AppSupabaseClient,
  connectionId: string,
  errorCode: string,
): Promise<void> {
  await updateConnection(supabase, connectionId, {
    last_error: errorCode.slice(0, 120),
    status: 'reauth_required',
  })
}

export async function updateMoodleConnectionDiscovery(
  supabase: AppSupabaseClient,
  input: {
    capabilities: Json
    connectionId: string
    email: string | null
    fullName: string | null
    moodleUserId: string
    username: string | null
  },
): Promise<void> {
  await updateConnection(supabase, input.connectionId, {
    capabilities: input.capabilities,
    moodle_email: input.email,
    moodle_full_name: input.fullName,
    moodle_user_id: input.moodleUserId,
    moodle_username: input.username,
  })
}

export async function updateMoodleSiteObservation(
  supabase: AppSupabaseClient,
  siteId: string,
  release: string | null,
  version: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('moodle_sites')
    .update({ release, version })
    .eq('id', siteId)

  if (error) throw error
}

export async function findFreshMoodleCategoryCache(
  supabase: AppSupabaseClient,
  connectionId: string,
  nowIso: string,
): Promise<Tables<'moodle_category_cache'> | null> {
  const { data, error } = await supabase
    .from('moodle_category_cache')
    .select('*')
    .eq('moodle_connection_id', connectionId)
    .eq('cache_key', 'visible_categories')
    .gt('expires_at', nowIso)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function upsertMoodleCategoryCache(
  supabase: AppSupabaseClient,
  input: {
    byteSize: number
    categories: Json
    connectionId: string
    contentHash: string
    expiresAt: string
    observedAt: string
  },
): Promise<void> {
  const { error } = await supabase
    .from('moodle_category_cache')
    .upsert({
      byte_size: input.byteSize,
      cache_key: 'visible_categories',
      categories: input.categories,
      content_hash: input.contentHash,
      expires_at: input.expiresAt,
      moodle_connection_id: input.connectionId,
      observed_at: input.observedAt,
    }, { onConflict: 'moodle_connection_id,cache_key', ignoreDuplicates: false })

  if (error) throw error
}
