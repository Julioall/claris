import type {
  AppSupabaseClient,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '../../db/mod.ts'

export type UserProfile = Tables<'users'>
export type UserProfileInsert = TablesInsert<'users'>
export type UserProfileUpdate = TablesUpdate<'users'>

export async function findUserById(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<Pick<UserProfile, 'id' | 'moodle_user_id'> | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, moodle_user_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function findUserByMoodleUserId(
  supabase: AppSupabaseClient,
  moodleUserId: string,
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('moodle_user_id', moodleUserId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function findUserByMoodleUsername(
  supabase: AppSupabaseClient,
  moodleUsername: string,
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('moodle_username', moodleUsername)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function updateUserProfile(
  supabase: AppSupabaseClient,
  userId: string,
  payload: UserProfileUpdate,
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createUserProfile(
  supabase: AppSupabaseClient,
  payload: UserProfileInsert,
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('users')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function touchUserLastLogin(
  supabase: AppSupabaseClient,
  userId: string,
  timestamp: string,
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ last_login: timestamp, updated_at: timestamp })
    .eq('id', userId)

  if (error) throw error
}

export async function touchUserLastSync(
  supabase: AppSupabaseClient,
  userId: string,
  timestamp: string,
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ last_sync: timestamp })
    .eq('id', userId)

  if (error) throw error
}