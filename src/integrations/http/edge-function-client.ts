import { supabase } from '@/integrations/supabase/client';
import { authGateway } from '@/integrations/auth/auth-gateway';

const API_VERSION_HEADER = 'x-claris-api-version';
const CORRELATION_ID_HEADER = 'x-correlation-id';

interface InvokeResult {
  data: unknown;
  error: unknown;
}

export interface EdgeFunctionClientDependencies {
  createCorrelationId(): string;
  getAccessToken(forceRefresh: boolean, required: boolean): Promise<string | null>;
  invoke(functionName: string, options: {
    body?: Record<string, unknown>;
    headers: Record<string, string>;
    signal: AbortSignal;
  }): Promise<InvokeResult>;
}

export interface InvokeEdgeFunctionOptions {
  auth?: 'required' | 'optional' | 'none';
  body?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface ApiSuccessEnvelope<TData> {
  data: TData;
  correlationId: string;
}

interface ParsedInvokeError {
  code: string;
  correlationId?: string;
  details?: unknown;
  message: string;
  status?: number;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly correlationId?: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(error: ParsedInvokeError, options?: ErrorOptions) {
    super(error.message, options);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.correlationId = error.correlationId;
    this.details = error.details;
    this.status = error.status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function parseInvokeError(error: unknown): Promise<ParsedInvokeError> {
  const errorRecord = asRecord(error);
  const context = errorRecord?.context instanceof Response ? errorRecord.context : null;
  let payload: Record<string, unknown> | null = null;

  if (context) {
    try {
      payload = asRecord(await context.clone().json());
    } catch {
      payload = null;
    }
  }

  const nestedError = asRecord(payload?.error);
  if (nestedError) {
    return {
      code: typeof nestedError.code === 'string' ? nestedError.code : 'edge_function_error',
      message: typeof nestedError.message === 'string' ? nestedError.message : 'Edge Function request failed.',
      details: nestedError.details,
      correlationId: typeof nestedError.correlationId === 'string' ? nestedError.correlationId : undefined,
      status: context?.status,
    };
  }

  const legacyMessage = typeof payload?.error === 'string'
    ? payload.error
    : typeof payload?.message === 'string'
      ? payload.message
      : typeof errorRecord?.message === 'string'
        ? errorRecord.message
        : 'Edge Function request failed.';

  return {
    code: context ? 'edge_function_error' : 'network_error',
    message: legacyMessage,
    status: context?.status,
  };
}

function unwrapEnvelope<TData>(value: unknown): ApiSuccessEnvelope<TData> {
  const envelope = asRecord(value);
  if (!envelope || !('data' in envelope) || typeof envelope.correlationId !== 'string') {
    throw new ApiClientError({
      code: 'invalid_response',
      message: 'A API retornou uma resposta invalida.',
    });
  }

  return envelope as unknown as ApiSuccessEnvelope<TData>;
}

export function createEdgeFunctionClient(dependencies: EdgeFunctionClientDependencies) {
  async function resolveToken(mode: InvokeEdgeFunctionOptions['auth'], forceRefresh: boolean): Promise<string | null> {
    if (mode === 'none') return null;
    try {
      return await dependencies.getAccessToken(forceRefresh, mode === 'required');
    } catch (error) {
      throw new ApiClientError(
        { code: 'session_expired', message: 'Sessao expirada. Faca login novamente.' },
        { cause: error },
      );
    }
  }

  return async function invokeEdgeFunction<TData>(
    functionName: string,
    options: InvokeEdgeFunctionOptions = {},
  ): Promise<TData> {
    const authMode = options.auth ?? 'required';
    const correlationId = dependencies.createCorrelationId();
    const controller = new AbortController();
    let timedOut = false;

    const abortFromCaller = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener('abort', abortFromCaller, { once: true });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? 25_000);

    const execute = async (token: string | null): Promise<InvokeResult> => dependencies.invoke(functionName, {
      body: options.body,
      headers: {
        [API_VERSION_HEADER]: '1',
        [CORRELATION_ID_HEADER]: correlationId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });

    try {
      let token = await resolveToken(authMode, false);
      let result = await execute(token);
      let parsedError = result.error ? await parseInvokeError(result.error) : null;

      if (parsedError?.status === 401 && authMode !== 'none') {
        token = await resolveToken(authMode, true);
        result = await execute(token);
        parsedError = result.error ? await parseInvokeError(result.error) : null;
      }

      if (parsedError) throw new ApiClientError(parsedError, { cause: result.error });
      return unwrapEnvelope<TData>(result.data).data;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ApiClientError({
          code: timedOut ? 'timeout' : 'aborted',
          message: timedOut ? 'A requisicao excedeu o tempo limite.' : 'A requisicao foi cancelada.',
        }, { cause: error });
      }
      if (error instanceof ApiClientError) throw error;
      throw new ApiClientError({ code: 'network_error', message: 'Nao foi possivel conectar ao servidor.' }, { cause: error });
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
  };
}

export const invokeEdgeFunction = createEdgeFunctionClient({
  createCorrelationId: () => crypto.randomUUID(),
  getAccessToken: (forceRefresh, required) => authGateway.getAccessToken(forceRefresh, required),
  invoke: (functionName, options) => supabase.functions.invoke(functionName, options),
});
