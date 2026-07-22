export const CLARIS_INVITATIONS_CONTRACT_VERSION = 1 as const;

export type ClarisInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface ClarisInvitation {
  emailMasked: string;
  expiresAt: string;
  id: string;
  status: ClarisInvitationStatus;
}

export interface ClarisInvitationResponse {
  contractVersion: typeof CLARIS_INVITATIONS_CONTRACT_VERSION;
  invitation: ClarisInvitation;
}

export interface ClarisInvitationsResponse {
  contractVersion: typeof CLARIS_INVITATIONS_CONTRACT_VERSION;
  invitations: ClarisInvitation[];
}
