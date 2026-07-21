import { corsHeaders } from './cors.ts'
import { apiErrorResponse, errorResponse } from './response.ts'
import { RequestBodyValidationError } from './body.ts'
import { ApiError } from './api-error.ts'
import { isApiV1Request } from './contract.ts'
import { resolveCorrelationId, withCorrelationId } from './correlation.ts'
import { createRequestLogger, type RequestLogger } from './logger.ts'

type EmptyBody = Record<string, never>
type BodyParser<TBody> = (rawBody: unknown, req: Request) => TBody | Promise<TBody>

/**
 * Context passed to every handler function.
 */
export interface HandlerContext<TBody = EmptyBody> {
  req: Request
  body: TBody
  correlationId: string
  logger: RequestLogger
}

/**
 * Context for authenticated handlers — includes the verified user.
 */
export interface AuthenticatedHandlerContext<TBody = EmptyBody> extends HandlerContext<TBody> {
  user: { id: string; email?: string }
}

type HandlerFn<TBody> = (ctx: HandlerContext<TBody>) => Promise<Response>
type AuthenticatedHandlerFn<TBody> = (ctx: AuthenticatedHandlerContext<TBody>) => Promise<Response>
type AuthenticatedUser = AuthenticatedHandlerContext['user']
type AuthResolver = (req: Request) => Promise<AuthenticatedUser | null>
type AuthorizationFn<TBody> = (ctx: AuthenticatedHandlerContext<TBody>) => boolean | Promise<boolean>
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024

interface HandlerOptions<TBody> {
  /** If true, validates Authorization header and injects user into context. */
  requireAuth?: boolean
  /** Parses and validates the request body before the handler runs. */
  parseBody?: BodyParser<TBody>
  /** Authorizes the resolved actor for this use case. */
  authorize?: AuthorizationFn<TBody>
  /** Test seam; production uses the shared Supabase Auth resolver. */
  resolveUser?: AuthResolver
  /** Test seam for deterministic correlation IDs. */
  createCorrelationId?: () => string
  /** Optional logger factory; it must not log request bodies or credentials. */
  createLogger?: (correlationId: string) => RequestLogger
  /** Maximum UTF-8 request body size. Defaults to 10 MiB. */
  maxBodyBytes?: number
}

async function resolveAuthenticatedUser(req: Request): Promise<AuthenticatedUser | null> {
  const { getAuthenticatedUser } = await import('../auth/user.ts')
  const { createServiceClient } = await import('../db/client.ts')
  return getAuthenticatedUser(req, createServiceClient())
}

function handledErrorResponse(
  req: Request,
  correlationId: string,
  code: string,
  message: string,
  status: number,
  details?: unknown,
): Response {
  const response = isApiV1Request(req)
    ? apiErrorResponse({ code, message, details }, status, correlationId)
    : errorResponse(message, status)

  return withCorrelationId(response, correlationId)
}

/**
 * Creates a standardized Deno.serve handler that:
 * - Handles CORS preflight
 * - Parses JSON body
 * - Wraps errors in a consistent response
 * - Optionally validates authentication
 */
export function createHandler<TBody = EmptyBody>(
  fn: AuthenticatedHandlerFn<TBody>,
  options: HandlerOptions<TBody> & { requireAuth: true },
): (req: Request) => Promise<Response>
export function createHandler<TBody = EmptyBody>(
  fn: HandlerFn<TBody>,
  options?: HandlerOptions<TBody>,
): (req: Request) => Promise<Response>
export function createHandler<TBody = EmptyBody>(
  fn: HandlerFn<TBody> | AuthenticatedHandlerFn<TBody>,
  options: HandlerOptions<TBody> = {}
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const correlationId = resolveCorrelationId(req, options.createCorrelationId)
    const logger = (options.createLogger ?? createRequestLogger)(correlationId)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return withCorrelationId(new Response('ok', { headers: corsHeaders }), correlationId)
    }

    try {
      // Parse body (empty object for GET/DELETE or when no body is provided)
      let rawBody: unknown = {}
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
        const declaredLength = Number(req.headers.get('content-length'))
        if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
          return handledErrorResponse(req, correlationId, 'payload_too_large', 'Request body too large', 413)
        }

        const text = await req.text()
        if (new TextEncoder().encode(text).byteLength > maxBodyBytes) {
          return handledErrorResponse(req, correlationId, 'payload_too_large', 'Request body too large', 413)
        }

        if (text.trim()) {
          try {
            rawBody = JSON.parse(text)
          } catch {
            return handledErrorResponse(req, correlationId, 'invalid_json', 'Invalid JSON body', 400)
          }
        }
      }

      const body = options.parseBody
        ? await options.parseBody(rawBody, req)
        : rawBody as TBody

      // Auth check
      if (options.requireAuth) {
        const user = await (options.resolveUser ?? resolveAuthenticatedUser)(req)
        if (!user) {
          return handledErrorResponse(req, correlationId, 'unauthorized', 'Unauthorized', 401)
        }

        const context: AuthenticatedHandlerContext<TBody> = {
          req,
          body,
          correlationId,
          logger,
          user,
        }
        if (options.authorize && !await options.authorize(context)) {
          return handledErrorResponse(req, correlationId, 'forbidden', 'Forbidden', 403)
        }

        return withCorrelationId(await (fn as AuthenticatedHandlerFn<TBody>)(context), correlationId)
      }

      return withCorrelationId(await (fn as HandlerFn<TBody>)({
        req,
        body,
        correlationId,
        logger,
      }), correlationId)
    } catch (error: unknown) {
      if (error instanceof RequestBodyValidationError) {
        return handledErrorResponse(
          req,
          correlationId,
          error.status === 422 ? 'validation_failed' : 'invalid_request',
          error.message,
          error.status,
        )
      }

      if (error instanceof ApiError) {
        return handledErrorResponse(
          req,
          correlationId,
          error.code,
          error.message,
          error.status,
          error.details,
        )
      }

      logger.error('unhandled_error', error)
      return handledErrorResponse(
        req,
        correlationId,
        'internal_error',
        'Internal server error',
        500,
      )
    }
  }
}
