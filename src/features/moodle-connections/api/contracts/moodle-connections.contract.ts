export const MOODLE_CONNECTIONS_CONTRACT_VERSION = 2 as const;

export type MoodleConnectionStatus =
  | 'active'
  | 'reauth_required'
  | 'disconnecting'
  | 'disabled';

export interface MoodleSiteOption {
  id: string;
  name: string;
  slug: string;
}

export interface MoodleConnection {
  alias: string;
  canWrite: boolean;
  id: string;
  lastValidatedAt: string | null;
  reauthEnabled: boolean;
  site: MoodleSiteOption;
  status: MoodleConnectionStatus;
  usernameMasked: string | null;
}

export interface MoodleSitesResponse {
  contractVersion: typeof MOODLE_CONNECTIONS_CONTRACT_VERSION;
  sites: MoodleSiteOption[];
}

export interface MoodleConnectionsResponse {
  connections: MoodleConnection[];
  contractVersion: typeof MOODLE_CONNECTIONS_CONTRACT_VERSION;
}

export interface MoodleConnectionResponse {
  connection: MoodleConnection;
  contractVersion: typeof MOODLE_CONNECTIONS_CONTRACT_VERSION;
}

export interface MoodleDisconnectResponse extends MoodleConnectionResponse {
  pendingLeases: number;
}
