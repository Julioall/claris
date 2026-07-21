export const AUTHORIZATION_CONTRACT_VERSION = 1 as const;

export interface AuthorizationContextDto {
  contractVersion: typeof AUTHORIZATION_CONTRACT_VERSION;
  group: {
    id: string;
    name: string;
    slug: string;
  } | null;
  isAdmin: boolean;
  permissions: string[];
}
