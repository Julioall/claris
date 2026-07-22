import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import {
  CLARIS_INVITATIONS_CONTRACT_VERSION,
  type ClarisInvitation,
  type ClarisInvitationResponse,
  type ClarisInvitationsResponse,
  type ClarisInvitationStatus,
} from './contracts/claris-invitations.contract';

const STATUSES = new Set<ClarisInvitationStatus>(['pending', 'accepted', 'revoked', 'expired']);

function invitation(value: unknown): value is ClarisInvitation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<ClarisInvitation>;
  return typeof item.id === 'string'
    && typeof item.emailMasked === 'string'
    && typeof item.expiresAt === 'string'
    && typeof item.status === 'string'
    && STATUSES.has(item.status as ClarisInvitationStatus);
}

function version(value: unknown): value is { contractVersion: 1 } {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (value as { contractVersion?: unknown }).contractVersion === CLARIS_INVITATIONS_CONTRACT_VERSION;
}

function invalid(): never {
  throw new Error('A API de convites retornou uma resposta invalida.');
}

export async function listClarisInvitations(): Promise<ClarisInvitation[]> {
  const response = await invokeEdgeFunction<ClarisInvitationsResponse>('claris-invitations', { body: { action: 'list' } });
  if (!version(response) || !Array.isArray(response.invitations) || !response.invitations.every(invitation)) invalid();
  return response.invitations;
}

async function command(body: Record<string, unknown>): Promise<ClarisInvitation> {
  const response = await invokeEdgeFunction<ClarisInvitationResponse>('claris-invitations', { body });
  if (!version(response) || !invitation(response.invitation)) invalid();
  return response.invitation;
}

export function createClarisInvitation(input: { email: string; fullName: string }): Promise<ClarisInvitation> {
  return command({
    action: 'create',
    appRole: 'tutor',
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim(),
  });
}

export function resendClarisInvitation(invitationId: string): Promise<ClarisInvitation> {
  return command({ action: 'resend', invitationId });
}

export function revokeClarisInvitation(invitationId: string): Promise<ClarisInvitation> {
  return command({ action: 'revoke', invitationId });
}
