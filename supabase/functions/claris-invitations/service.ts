import { ApiError } from '../_shared/http/mod.ts'
import type { AppSupabaseClient } from '../_shared/db/mod.ts'
import {
  CLARIS_INVITATIONS_CONTRACT_VERSION,
  type ClarisInvitationDto,
  type ClarisInvitationResponseDto,
  type ClarisInvitationsResponseDto,
  type ProvisionClarisAccountResponseDto,
} from './contract.ts'
import type { ClarisInvitationsPayload } from './payload.ts'
import type { ClarisInvitationRecord, ClarisInvitationsRepository } from './repository.ts'
import { normalizeClarisInviteRedirect } from './redirect.ts'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'*'.repeat(Math.max(1, Math.min(8, local.length - visible.length)))}@${domain}`
}

function dto(row: ClarisInvitationRecord): ClarisInvitationDto {
  return {
    emailMasked: maskEmail(row.email_normalized),
    expiresAt: row.expires_at,
    id: row.id,
    status: row.status as ClarisInvitationDto['status'],
  }
}

function constraintCode(error: unknown): string | null {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : null
}

export async function executeClarisInvitationAction(
  repository: ClarisInvitationsRepository,
  authClient: AppSupabaseClient,
  actor: { email?: string; id: string },
  payload: ClarisInvitationsPayload,
  now = new Date(),
): Promise<ClarisInvitationResponseDto | ClarisInvitationsResponseDto | ProvisionClarisAccountResponseDto> {
  if (payload.action === 'list') {
    return {
      contractVersion: CLARIS_INVITATIONS_CONTRACT_VERSION,
      invitations: (await repository.list()).map(dto),
    }
  }

  if (payload.action === 'provision_account') {
    if (!actor.email) throw ApiError.forbidden('A confirmed email is required.')
    const result = await repository.provision(actor.id, actor.email.trim().toLowerCase())
    return {
      contractVersion: CLARIS_INVITATIONS_CONTRACT_VERSION,
      nextPath: result.nextPath === '/' ? '/' : '/onboarding/moodle',
      onboardingRequired: result.onboardingRequired === true,
      userId: actor.id,
    }
  }

  if (payload.action === 'create') {
    let invitation: ClarisInvitationRecord
    try {
      invitation = await repository.create({
        email: payload.email,
        expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(),
        fullName: payload.fullName,
        invitedBy: actor.id,
      })
    } catch (error) {
      if (constraintCode(error) === '23505') throw ApiError.conflict('A pending invitation already exists.')
      throw error
    }

    const configuredRedirect = Deno.env.get('CLARIS_INVITE_REDIRECT_URL') ?? ''
    if (!configuredRedirect.trim()) {
      await repository.deletePending(invitation.id)
      throw new Error('CLARIS_INVITE_REDIRECT_URL is not configured')
    }
    const redirectTo = normalizeClarisInviteRedirect(configuredRedirect)
    const { error } = await authClient.auth.admin.inviteUserByEmail(payload.email, {
      redirectTo,
      data: { full_name: payload.fullName },
    })
    if (error) {
      await repository.deletePending(invitation.id)
      throw new ApiError('invitation_delivery_failed', 'The invitation could not be delivered.', 502)
    }
    return { contractVersion: CLARIS_INVITATIONS_CONTRACT_VERSION, invitation: dto(invitation) }
  }

  const invitation = await repository.findPending(payload.invitationId)
  if (!invitation) throw ApiError.notFound('Pending invitation was not found.')
  if (payload.action === 'resend') {
    const redirectTo = normalizeClarisInviteRedirect(Deno.env.get('CLARIS_INVITE_REDIRECT_URL') ?? '')
    const { error } = await authClient.auth.admin.inviteUserByEmail(invitation.email_normalized, {
      redirectTo,
      data: { full_name: invitation.full_name },
    })
    if (error) throw new ApiError('invitation_delivery_failed', 'The invitation could not be delivered.', 502)
    return { contractVersion: CLARIS_INVITATIONS_CONTRACT_VERSION, invitation: dto(invitation) }
  }

  const revoked = await repository.revoke(invitation.id)
  if (!revoked) throw ApiError.conflict('Invitation status changed before revocation.')
  return { contractVersion: CLARIS_INVITATIONS_CONTRACT_VERSION, invitation: dto(revoked) }
}
