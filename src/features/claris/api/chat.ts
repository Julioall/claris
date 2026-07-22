import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';
import { CLARIS_CONFIGURED_STORAGE_KEY } from '@/lib/claris-settings';

import type {
  ClarisAvailabilityDto,
  ClarisAvailabilityStatus,
  ClarisChatResponseDto,
  ClarisRichBlockDto,
  ClarisUiActionDto,
} from './contracts/claris-chat.contract';

export type { ClarisAvailabilityStatus } from './contracts/claris-chat.contract';

const FUNCTION_NAME = 'claris-chat';

export interface ClarisChatInvokePayload {
  connectionId?: string;
  action?: {
    kind: 'quick_reply';
    value: string;
    jobId?: string;
  };
  history: Array<{ role: 'assistant' | 'user'; content: string }>;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUiAction(value: unknown): value is ClarisUiActionDto {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.jobId === null || typeof value.jobId === 'string')
    && value.kind === 'quick_reply'
    && typeof value.label === 'string'
    && typeof value.value === 'string';
}

function hasStringRows(value: unknown): value is Array<Record<string, string>> {
  return Array.isArray(value) && value.every((row) => (
    isRecord(row) && Object.values(row).every((cell) => typeof cell === 'string')
  ));
}

function isRichBlock(value: unknown): value is ClarisRichBlockDto {
  if (!isRecord(value) || typeof value.title !== 'string') return false;

  if (value.type === 'data_table') {
    return typeof value.tool === 'string'
      && typeof value.emptyMessage === 'string'
      && Array.isArray(value.columns)
      && value.columns.every((column) => (
        isRecord(column) && typeof column.key === 'string' && typeof column.label === 'string'
      ))
      && hasStringRows(value.rows);
  }

  return value.type === 'stat_cards'
    && Array.isArray(value.stats)
    && value.stats.every((stat) => (
      isRecord(stat)
      && typeof stat.label === 'string'
      && typeof stat.value === 'string'
      && (stat.variant === 'default' || stat.variant === 'warning' || stat.variant === 'danger')
    ));
}

function invalidResponse(): never {
  throw new Error('A API de chat da Claris retornou uma resposta invalida.');
}

export async function fetchClarisAvailability(): Promise<ClarisAvailabilityStatus> {
  try {
    const response = await invokeEdgeFunction<ClarisAvailabilityDto>(FUNCTION_NAME, {
      body: { operation: 'get_availability' },
    });
    if (
      !isRecord(response)
      || response.contractVersion !== 1
      || (response.status !== 'ready' && response.status !== 'not_configured' && response.status !== 'invalid')
    ) {
      invalidResponse();
    }

    localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, String(response.status === 'ready'));
    return response.status;
  } catch {
    localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, 'false');
    return 'not_configured';
  }
}

export async function invokeClarisChat(
  payload: ClarisChatInvokePayload,
): Promise<ClarisChatResponseDto> {
  const response = await invokeEdgeFunction<ClarisChatResponseDto>(FUNCTION_NAME, {
    body: {
      operation: 'send_message',
      message: payload.message,
      history: payload.history,
      ...(payload.connectionId ? { connectionId: payload.connectionId } : {}),
      ...(payload.action ? { action: payload.action } : {}),
    },
    timeoutMs: 125_000,
  });

  if (
    !isRecord(response)
    || response.contractVersion !== 1
    || typeof response.reply !== 'string'
    || !Array.isArray(response.uiActions)
    || !response.uiActions.every(isUiAction)
    || !Array.isArray(response.richBlocks)
    || !response.richBlocks.every(isRichBlock)
  ) {
    invalidResponse();
  }

  return response;
}
