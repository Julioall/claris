import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';
import type { CleanupSelectionId } from '@/features/settings/lib/cleanup-options';

const FUNCTION_NAME = 'data-cleanup';
const CLEANUP_CONFIRMATION = 'CONFIRM_OPERATIONAL_DATA_CLEANUP_V1';
export const DATA_CLEANUP_CONTRACT_VERSION = 1 as const;

export type CleanupDataInput =
  | { confirmed: true; mode: 'full_cleanup' }
  | { confirmed: true; mode: 'selected_cleanup'; selectionIds: CleanupSelectionId[] };

export interface CleanupDataError {
  error: string;
  selectionId: CleanupSelectionId;
}

export interface CleanupDataResponse {
  completedSelectionIds: CleanupSelectionId[];
  contractVersion: typeof DATA_CLEANUP_CONTRACT_VERSION;
  errors: CleanupDataError[];
  operationId: string;
  success: boolean;
}

export async function cleanupData(input: CleanupDataInput): Promise<CleanupDataResponse> {
  if (input.confirmed !== true) {
    throw new Error('A limpeza exige confirmação explícita.');
  }
  if (input.mode === 'selected_cleanup' && input.selectionIds.length === 0) {
    throw new Error('Selecione ao menos uma categoria para limpeza.');
  }

  const response = await invokeEdgeFunction<CleanupDataResponse>(FUNCTION_NAME, {
    body: {
      action: 'execute_cleanup',
      confirmation: CLEANUP_CONFIRMATION,
      mode: input.mode,
      ...(input.mode === 'selected_cleanup' ? { selectionIds: input.selectionIds } : {}),
    },
  });

  if (
    !response
    || typeof response !== 'object'
    || response.contractVersion !== DATA_CLEANUP_CONTRACT_VERSION
  ) {
    throw new Error('Versão incompatível do contrato de limpeza.');
  }

  return response;
}
