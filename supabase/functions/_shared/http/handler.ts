import { corsHeaders } from './cors.ts'
import { jsonResponse, errorResponse } from './response.ts'
import { RequestBodyValidationError } from './body.ts'

type EmptyBody = Record<string, never>
type BodyParser<TBody> = (rawBody: unknown, req: Request) => TBody | Promise<TBody>

/**
 * Context passed to every handler function.
 */
export interface HandlerContext<TBody = EmptyBody> {
  req: Request
  body: TBody
}

/**
 * Context for authenticated handlers — includes the verified user.
 */
export interface AuthenticatedHandlerContext<TBody = EmptyBody> extends HandlerContext<TBody> {
  user: { id: string; email?: string }
}

type HandlerFn<TBody> = (ctx: HandlerContext<TBody>) => Promise<Response>
type AuthenticatedHandlerFn<TBody> = (ctx: AuthenticatedHandlerContext<TBody>) => Promise<Response>

interface HandlerOptions<TBody> {
  /** If true, validates Authorization header and injects user into context. */
  requireAuth?: boolean
  /** Parses and validates the request body before the handler runs. */
  parseBody?: BodyParser<TBody>
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
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    try {
      // Parse body (empty object for GET/DELETE or when no body is provided)
      let rawBody: unknown = {}
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const text = await req.text()
        if (text.trim()) {
          try {
            rawBody = JSON.parse(text)
          } catch {
            return errorResponse('Invalid JSON body', 400)
          }
        }
      }

      const body = options.parseBody
        ? await options.parseBody(rawBody, req)
        : rawBody as TBody

      // Auth check
      if (options.requireAuth) {
        const { getAuthenticatedUser } = await import('../auth/user.ts')
        const { createServiceClient } = await import('../db/client.ts')
        const supabase = createServiceClient()
        const user = await getAuthenticatedUser(req, supabase)
        if (!user) return errorResponse('Unauthorized', 401)
        return await (fn as AuthenticatedHandlerFn<TBody>)({ req, body, user })
      }

      return await (fn as HandlerFn<TBody>)({ req, body })
    } catch (error: unknown) {
      if (error instanceof RequestBodyValidationError) {
        return errorResponse(error.message, error.status)
      }

      console.error('Unhandled error:', error)
      return errorResponse(
        error instanceof Error ? error.message : 'Internal server error',
        500
      )
    }
  }
}
