import type {
  AppSupabaseClient,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '../../db/mod.ts'

export type MoodleReauthCredential = Tables<'user_moodle_reauth_credentials'>

interface UpsertMoodleReauthCredentialInput {
  userId: string
  moodleService: string
  moodleUrl: string
  moodleUsername: string
  credentialCiphertext: string | null
  reauthEnabled: boolean
  lastError?: string | null
  lastReauthAt?: string | null
  lastTokenIssuedAt?: string | null
}

export async function findMoodleReauthCredentialByUserId(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<MoodleReauthCredential | null> {
  const { data, error } = await supabase
    .from('user_moodle_reauth_credentials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function upsertMoodleReauthCredential(
  supabase: AppSupabaseClient,
  input: UpsertMoodleReauthCredentialInput,
): Promise<MoodleReauthCredential> {
  const payload: TablesInsert<'user_moodle_reauth_credentials'> = {
    user_id: input.userId,
    moodle_service: input.moodleService,
    moodle_url: input.moodleUrl,
    moodle_username: input.moodleUsername,
    credential_ciphertext: input.credentialCiphertext,
    reauth_enabled: input.reauthEnabled,
    last_error: input.lastError ?? null,
    last_reauth_at: input.lastReauthAt ?? null,
    last_token_issued_at: input.lastTokenIssuedAt ?? null,
  }

  const { data, error } = await supabase
    .from('user_moodle_reauth_credentials')
    .upsert(payload, { onConflict: 'user_id', ignoreDuplicates: false })
    .select('*')
    .single()

  if (error || !data) {
    throw error ?? new Error('Falha ao salvar credencial de reautorizacao do Moodle')
  }

  return data
}

export async function disableMoodleReauthCredential(
  supabase: AppSupabaseClient,
  userId: string,
  lastError?: string | null,
): Promise<void> {
  const payload: TablesUpdate<'user_moodle_reauth_credentials'> = {
    credential_ciphertext: null,
    last_error: lastError ?? null,
    reauth_enabled: false,
  }

  const { error } = await supabase
    .from('user_moodle_reauth_credentials')
    .update(payload)
    .eq('user_id', userId)

  if (error) throw error
}

export async function markMoodleReauthSuccess(
  supabase: AppSupabaseClient,
  userId: string,
  timestamp: string,
): Promise<void> {
  const payload: TablesUpdate<'user_moodle_reauth_credentials'> = {
    last_error: null,
    last_reauth_at: timestamp,
    last_token_issued_at: timestamp,
    reauth_enabled: true,
  }

  const { error } = await supabase
    .from('user_moodle_reauth_credentials')
    .update(payload)
    .eq('user_id', userId)

  if (error) throw error
}

export async function markMoodleReauthFailure(
  supabase: AppSupabaseClient,
  userId: string,
  errorMessage: string,
): Promise<void> {
  const payload: TablesUpdate<'user_moodle_reauth_credentials'> = {
    last_error: errorMessage,
  }

  const { error } = await supabase
    .from('user_moodle_reauth_credentials')
    .update(payload)
    .eq('user_id', userId)

  if (error) throw error
}
