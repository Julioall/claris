import { createServiceClient, type AppSupabaseClient, type Tables } from '../_shared/db/mod.ts'

export type ClarisInvitationRecord = Tables<'claris_invitations'>

export interface ClarisInvitationsRepository {
  create(input: { email: string; expiresAt: string; fullName: string; invitedBy: string }): Promise<ClarisInvitationRecord>
  deletePending(invitationId: string): Promise<void>
  findPending(invitationId: string): Promise<ClarisInvitationRecord | null>
  list(): Promise<ClarisInvitationRecord[]>
  provision(authUserId: string, email: string): Promise<Record<string, unknown>>
  revoke(invitationId: string): Promise<ClarisInvitationRecord | null>
}

export function createClarisInvitationsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): ClarisInvitationsRepository {
  return {
    async create(input) {
      const { data, error } = await supabase
        .from('claris_invitations')
        .insert({
          app_role: 'tutor',
          email_normalized: input.email,
          expires_at: input.expiresAt,
          full_name: input.fullName,
          invited_by: input.invitedBy,
          status: 'pending',
        })
        .select('*')
        .single()
      if (error || !data) throw error ?? new Error('Invitation was not created')
      return data
    },

    async deletePending(invitationId) {
      const { error } = await supabase
        .from('claris_invitations')
        .delete()
        .eq('id', invitationId)
        .eq('status', 'pending')
      if (error) throw error
    },

    async findPending(invitationId) {
      const { data, error } = await supabase
        .from('claris_invitations')
        .select('*')
        .eq('id', invitationId)
        .eq('status', 'pending')
        .maybeSingle()
      if (error) throw error
      return data
    },

    async list() {
      const { data, error } = await supabase
        .from('claris_invitations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },

    async provision(authUserId, email) {
      const { data, error } = await supabase.rpc('backend_provision_claris_account', {
        p_auth_user_id: authUserId,
        p_email: email,
      })
      if (error) throw error
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Account provisioning returned an invalid result')
      }
      return data as Record<string, unknown>
    },

    async revoke(invitationId) {
      const { data, error } = await supabase
        .from('claris_invitations')
        .update({ status: 'revoked' })
        .eq('id', invitationId)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data
    },
  }
}
