import {
  ApiClientError,
  invokeLegacyEdgeFunction,
} from '@/integrations/http/edge-function-client';
import { resolveFunctionsInvokeErrorMessage } from '@/lib/moodle-errors';

export async function invokeMoodleFunctionWithTimeout(params: {
  functionName: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  try {
    const data = await invokeLegacyEdgeFunction<Record<string, unknown> | null>(
      params.functionName,
      {
        body: params.body,
        timeoutMs: params.timeoutMs,
      },
    );

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof ApiClientError
          ? error.message
          : resolveFunctionsInvokeErrorMessage(error),
      },
    };
  }
}
