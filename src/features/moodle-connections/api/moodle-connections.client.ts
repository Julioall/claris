import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import {
  MOODLE_CONNECTIONS_CONTRACT_VERSION,
  type MoodleConnection,
  type MoodleConnectionResponse,
  type MoodleConnectionsResponse,
  type MoodleConnectionStatus,
  type MoodleDisconnectResponse,
  type MoodleSiteOption,
  type MoodleSitesResponse,
} from './contracts/moodle-connections.contract';

const FUNCTION_NAME = 'moodle-connections';
const STATUSES = new Set<MoodleConnectionStatus>([
  'active',
  'reauth_required',
  'disconnecting',
  'disabled',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSite(value: unknown): value is MoodleSiteOption {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.slug === 'string';
}

function isConnection(value: unknown): value is MoodleConnection {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.alias === 'string'
    && typeof value.canWrite === 'boolean'
    && typeof value.reauthEnabled === 'boolean'
    && (value.lastValidatedAt === null || typeof value.lastValidatedAt === 'string')
    && (value.usernameMasked === null || typeof value.usernameMasked === 'string')
    && typeof value.status === 'string'
    && STATUSES.has(value.status as MoodleConnectionStatus)
    && isSite(value.site);
}

function hasContract(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.contractVersion === MOODLE_CONNECTIONS_CONTRACT_VERSION;
}

function invalid(): never {
  throw new Error('A API de conexoes Moodle retornou uma resposta invalida.');
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  return await invokeEdgeFunction<T>(FUNCTION_NAME, { body });
}

export async function listMoodleSites(): Promise<MoodleSiteOption[]> {
  const response = await invoke<MoodleSitesResponse>({ action: 'list_sites' });
  if (!hasContract(response) || !Array.isArray(response.sites) || !response.sites.every(isSite)) {
    invalid();
  }
  return response.sites;
}

export async function listMoodleConnections(): Promise<MoodleConnection[]> {
  const response = await invoke<MoodleConnectionsResponse>({ action: 'list_connections' });
  if (
    !hasContract(response)
    || !Array.isArray(response.connections)
    || !response.connections.every(isConnection)
  ) {
    invalid();
  }
  return response.connections;
}

async function connectionCommand(body: Record<string, unknown>): Promise<MoodleConnection> {
  const response = await invoke<MoodleConnectionResponse>(body);
  if (!hasContract(response) || !isConnection(response.connection)) invalid();
  return response.connection;
}

export function createMoodleConnection(input: {
  alias: string;
  moodlePassword: string;
  moodleUsername: string;
  siteId: string;
}): Promise<MoodleConnection> {
  return connectionCommand({
    action: 'create_connection',
    alias: input.alias.trim(),
    canWrite: false,
    moodlePassword: input.moodlePassword,
    moodleUsername: input.moodleUsername.trim(),
    siteId: input.siteId,
  });
}

export function renameMoodleConnection(
  connectionId: string,
  alias: string,
): Promise<MoodleConnection> {
  return connectionCommand({ action: 'update_alias', connectionId, alias: alias.trim() });
}

export function updateMoodleConnectionReauth(input:
  | { connectionId: string; enabled: false }
  | {
    connectionId: string
    enabled: true
    moodlePassword: string
    moodleUsername: string
  }
): Promise<MoodleConnection> {
  return connectionCommand({
    action: 'update_reauth',
    connectionId: input.connectionId,
    enabled: input.enabled,
    ...(input.enabled
      ? {
          moodlePassword: input.moodlePassword,
          moodleUsername: input.moodleUsername.trim(),
        }
      : {}),
  });
}

export async function disconnectMoodleConnection(
  connectionId: string,
): Promise<{ connection: MoodleConnection; pendingLeases: number }> {
  const response = await invoke<MoodleDisconnectResponse>({ action: 'disconnect', connectionId });
  if (
    !hasContract(response)
    || !isConnection(response.connection)
    || !Number.isSafeInteger(response.pendingLeases)
    || response.pendingLeases < 0
  ) {
    invalid();
  }
  return { connection: response.connection, pendingLeases: response.pendingLeases };
}
