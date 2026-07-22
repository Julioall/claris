import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import {
  CLARIS_INVITATIONS_CONTRACT_VERSION,
  type ProvisionClarisAccountResponse,
} from './contracts/claris-account.contract';

function isProvisionResponse(value: unknown): value is ProvisionClarisAccountResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Partial<ProvisionClarisAccountResponse>;
  return response.contractVersion === CLARIS_INVITATIONS_CONTRACT_VERSION
    && typeof response.userId === 'string'
    && typeof response.onboardingRequired === 'boolean'
    && (response.nextPath === '/' || response.nextPath === '/onboarding/moodle');
}

export async function provisionClarisAccount(): Promise<ProvisionClarisAccountResponse> {
  const response = await invokeEdgeFunction<unknown>('claris-invitations', {
    body: { action: 'provision_account' },
  });
  if (!isProvisionResponse(response)) {
    throw new Error('A API de conta Claris retornou uma resposta invalida.');
  }
  return response;
}

export function buildClarisAuthRedirect(path: '/auth/accept-invite' | '/reset-password'): string {
  const base = import.meta.env.BASE_URL === '/' ? '/' : import.meta.env.BASE_URL;
  return new URL(`${base.replace(/\/$/, '')}${path}`, window.location.origin).toString();
}
