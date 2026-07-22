export const CLARIS_INVITATIONS_CONTRACT_VERSION = 1 as const;

export interface ProvisionClarisAccountResponse {
  contractVersion: typeof CLARIS_INVITATIONS_CONTRACT_VERSION;
  nextPath: '/onboarding/moodle' | '/';
  onboardingRequired: boolean;
  userId: string;
}
