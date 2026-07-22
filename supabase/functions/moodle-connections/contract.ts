export const MOODLE_CONNECTIONS_CONTRACT_VERSION = 2 as const

export type MoodleConnectionStatusDto =
  | 'active'
  | 'reauth_required'
  | 'disconnecting'
  | 'disabled'

export interface MoodleSiteOptionDto {
  id: string
  name: string
  slug: string
}

export interface MoodleConnectionDto {
  alias: string
  canWrite: boolean
  id: string
  lastValidatedAt: string | null
  reauthEnabled: boolean
  site: MoodleSiteOptionDto
  status: MoodleConnectionStatusDto
  usernameMasked: string | null
}

export interface MoodleSitesResponseDto {
  contractVersion: typeof MOODLE_CONNECTIONS_CONTRACT_VERSION
  sites: MoodleSiteOptionDto[]
}

export interface MoodleConnectionsResponseDto {
  connections: MoodleConnectionDto[]
  contractVersion: typeof MOODLE_CONNECTIONS_CONTRACT_VERSION
}

export interface MoodleConnectionResponseDto {
  connection: MoodleConnectionDto
  contractVersion: typeof MOODLE_CONNECTIONS_CONTRACT_VERSION
}

export interface MoodleDisconnectResponseDto extends MoodleConnectionResponseDto {
  pendingLeases: number
}
