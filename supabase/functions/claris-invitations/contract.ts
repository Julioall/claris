export const CLARIS_INVITATIONS_CONTRACT_VERSION = 1

export interface ClarisInvitationDto {
  emailMasked: string
  expiresAt: string
  id: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
}

export interface ClarisInvitationResponseDto {
  contractVersion: 1
  invitation: ClarisInvitationDto
}

export interface ClarisInvitationsResponseDto {
  contractVersion: 1
  invitations: ClarisInvitationDto[]
}

export interface ProvisionClarisAccountResponseDto {
  contractVersion: 1
  nextPath: '/onboarding/moodle' | '/'
  onboardingRequired: boolean
  userId: string
}
