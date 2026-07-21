import { corsHeaders } from './cors.ts'
import type { ApiErrorBody, ApiFailure, ApiSuccess } from './contract.ts'
import { API_CONTRACT_VERSION, API_VERSION_HEADER, CORRELATION_ID_HEADER } from './contract.ts'

/**
 * Returns a JSON response with CORS headers.
 */
export function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
  })
}

/**
 * Returns a JSON error response with CORS headers.
 */
export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status)
}

function apiHeaders(correlationId: string): HeadersInit {
  return {
    [API_VERSION_HEADER]: API_CONTRACT_VERSION,
    [CORRELATION_ID_HEADER]: correlationId,
  }
}

export function apiSuccessResponse<TData>(
  data: TData,
  correlationId: string,
  status = 200,
): Response {
  const body: ApiSuccess<TData> = { data, correlationId }
  return jsonResponse(body, status, apiHeaders(correlationId))
}

export function apiErrorResponse(
  error: Omit<ApiErrorBody, 'correlationId'>,
  status: number,
  correlationId: string,
): Response {
  const body: ApiFailure = {
    error: { ...error, correlationId },
  }
  return jsonResponse(body, status, apiHeaders(correlationId))
}
