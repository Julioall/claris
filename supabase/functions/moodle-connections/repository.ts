import {
  createServiceClient,
  type AppSupabaseClient,
  type Json,
  type Tables,
} from '../_shared/db/mod.ts'
import { cancelMoodleSyncJob } from '../_shared/domain/moodle-sync/worker-repository.ts'

export type MoodleSiteRecord = Tables<'moodle_sites'>
export type MoodleConnectionRecord = Tables<'user_moodle_connections'>

export interface CreateMoodleConnectionRecord {
  alias: string
  capabilities: Json
  credentialCiphertext: string
  moodleAvatarUrl: string | null
  moodleEmail: string | null
  moodleFullName: string | null
  moodleSiteId: string
  moodleUserId: string
  moodleUsername: string
  timestamp: string
  userId: string
}

export interface UpdateMoodleReauthRecord {
  capabilities: Json
  connectionId: string
  credentialCiphertext: string
  moodleAvatarUrl: string | null
  moodleEmail: string | null
  moodleFullName: string | null
  moodleUsername: string
  timestamp: string
  userId: string
}

export interface MoodleConnectionsRepository {
  beginDisconnect(userId: string, connectionId: string): Promise<MoodleConnectionRecord | null>
  cancelConnectionJobs(userId: string, connectionId: string): Promise<number>
  createConnection(input: CreateMoodleConnectionRecord): Promise<MoodleConnectionRecord>
  disableReauth(userId: string, connectionId: string): Promise<MoodleConnectionRecord | null>
  finalizeDisconnect(userId: string, connectionId: string): Promise<MoodleConnectionRecord | null>
  findApprovedSite(siteId: string): Promise<MoodleSiteRecord | null>
  findOwnedConnection(userId: string, connectionId: string): Promise<MoodleConnectionRecord | null>
  findSite(siteId: string): Promise<MoodleSiteRecord | null>
  listApprovedSites(): Promise<MoodleSiteRecord[]>
  listOwnedConnections(userId: string): Promise<MoodleConnectionRecord[]>
  updateAlias(userId: string, connectionId: string, alias: string): Promise<MoodleConnectionRecord | null>
  updateReauth(input: UpdateMoodleReauthRecord): Promise<MoodleConnectionRecord | null>
  updateSiteObservation(siteId: string, release: string | null, version: string | null): Promise<void>
}

function throwIfError(error: unknown): void {
  if (error) throw error
}

export function createMoodleConnectionsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): MoodleConnectionsRepository {
  return {
    async listApprovedSites() {
      const { data, error } = await supabase
        .from('moodle_sites')
        .select('*')
        .eq('status', 'approved')
        .order('name', { ascending: true })
      throwIfError(error)
      return data ?? []
    },

    async listOwnedConnections(userId) {
      const { data, error } = await supabase
        .from('user_moodle_connections')
        .select('*')
        .eq('user_id', userId)
        .order('alias', { ascending: true })
      throwIfError(error)
      return data ?? []
    },

    async findApprovedSite(siteId) {
      const { data, error } = await supabase
        .from('moodle_sites')
        .select('*')
        .eq('id', siteId)
        .eq('status', 'approved')
        .maybeSingle()
      throwIfError(error)
      return data
    },

    async findSite(siteId) {
      const { data, error } = await supabase
        .from('moodle_sites')
        .select('*')
        .eq('id', siteId)
        .maybeSingle()
      throwIfError(error)
      return data
    },

    async findOwnedConnection(userId, connectionId) {
      const { data, error } = await supabase
        .from('user_moodle_connections')
        .select('*')
        .eq('id', connectionId)
        .eq('user_id', userId)
        .maybeSingle()
      throwIfError(error)
      return data
    },

    async createConnection(input) {
      const { data, error } = await supabase
        .from('user_moodle_connections')
        .insert({
          alias: input.alias,
          can_write: false,
          capabilities: input.capabilities,
          credential_ciphertext: input.credentialCiphertext,
          last_error: null,
          last_reauth_at: input.timestamp,
          last_token_issued_at: input.timestamp,
          moodle_avatar_url: input.moodleAvatarUrl,
          moodle_email: input.moodleEmail,
          moodle_full_name: input.moodleFullName,
          moodle_site_id: input.moodleSiteId,
          moodle_user_id: input.moodleUserId,
          moodle_username: input.moodleUsername,
          reauth_enabled: true,
          status: 'active',
          user_id: input.userId,
        })
        .select('*')
        .single()
      if (error || !data) throw error ?? new Error('Moodle connection was not created')
      return data
    },

    async updateAlias(userId, connectionId, alias) {
      const { data, error } = await supabase
        .from('user_moodle_connections')
        .update({ alias })
        .eq('id', connectionId)
        .eq('user_id', userId)
        .neq('status', 'disabled')
        .select('*')
        .maybeSingle()
      throwIfError(error)
      return data
    },

    async updateReauth(input) {
      const { data, error } = await supabase
        .from('user_moodle_connections')
        .update({
          capabilities: input.capabilities,
          credential_ciphertext: input.credentialCiphertext,
          last_error: null,
          last_reauth_at: input.timestamp,
          last_token_issued_at: input.timestamp,
          moodle_avatar_url: input.moodleAvatarUrl,
          moodle_email: input.moodleEmail,
          moodle_full_name: input.moodleFullName,
          moodle_username: input.moodleUsername,
          reauth_enabled: true,
          status: 'active',
        })
        .eq('id', input.connectionId)
        .eq('user_id', input.userId)
        .in('status', ['active', 'reauth_required'])
        .select('*')
        .maybeSingle()
      throwIfError(error)
      return data
    },

    async disableReauth(userId, connectionId) {
      const { data, error } = await supabase
        .from('user_moodle_connections')
        .update({
          credential_ciphertext: null,
          last_error: null,
          reauth_enabled: false,
          status: 'reauth_required',
        })
        .eq('id', connectionId)
        .eq('user_id', userId)
        .in('status', ['active', 'reauth_required'])
        .select('*')
        .maybeSingle()
      throwIfError(error)
      return data
    },

    async beginDisconnect(userId, connectionId) {
      const { data, error } = await supabase
        .from('user_moodle_connections')
        .update({ status: 'disconnecting' })
        .eq('id', connectionId)
        .eq('user_id', userId)
        .in('status', ['active', 'reauth_required', 'disconnecting'])
        .select('*')
        .maybeSingle()
      throwIfError(error)
      return data
    },

    async cancelConnectionJobs(userId, connectionId) {
      const { data: contexts, error: contextsError } = await supabase
        .from('moodle_sync_job_context')
        .select('job_id')
        .eq('moodle_connection_id', connectionId)
      throwIfError(contextsError)

      const { data: metadataJobs, error: jobsError } = await supabase
        .from('background_jobs')
        .select('id')
        .eq('user_id', userId)
        .contains('metadata', { connection_id: connectionId })
        .in('status', ['pending', 'processing'])
      throwIfError(jobsError)
      const candidateIds = Array.from(new Set([
        ...(contexts ?? []).map((context) => context.job_id),
        ...(metadataJobs ?? []).map((job) => job.id),
      ]))
      if (candidateIds.length === 0) return 0

      const { data: activeJobs, error: activeJobsError } = await supabase
        .from('background_jobs')
        .select('id')
        .eq('user_id', userId)
        .in('id', candidateIds)
        .in('status', ['pending', 'processing'])
      throwIfError(activeJobsError)
      const jobIds = (activeJobs ?? []).map((job) => job.id)
      if (jobIds.length === 0) return 0

      await Promise.all(jobIds.map((jobId) => cancelMoodleSyncJob(supabase, jobId, userId)))

      const { count, error: countError } = await supabase
        .from('background_job_items')
        .select('id', { count: 'exact', head: true })
        .in('job_id', jobIds)
        .eq('status', 'processing')
      throwIfError(countError)
      return count ?? 0
    },

    async finalizeDisconnect(userId, connectionId) {
      const { data, error } = await supabase
        .from('user_moodle_connections')
        .update({
          credential_ciphertext: null,
          last_error: null,
          reauth_enabled: false,
          status: 'disabled',
        })
        .eq('id', connectionId)
        .eq('user_id', userId)
        .eq('status', 'disconnecting')
        .select('*')
        .maybeSingle()
      throwIfError(error)
      return data
    },

    async updateSiteObservation(siteId, release, version) {
      const { error } = await supabase
        .from('moodle_sites')
        .update({ release, version })
        .eq('id', siteId)
      throwIfError(error)
    },
  }
}
