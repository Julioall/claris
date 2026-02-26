import { corsHeaders } from './cors.ts'
import { jsonResponse, errorResponse } from './response.ts'

/**
 * Context passed to every handler function.
 */
export interface HandlerContext {
  req: Request
  body: Record<string, unknown>
}

/**
 * Context for authenticated handlers — includes the verified user.
 */
export interface AuthenticatedHandlerContext extends HandlerContext {
  user: { id: string; email?: string }
}

type HandlerFn = (ctx: HandlerContext) => Promise<Response>
type AuthenticatedHandlerFn = (ctx: AuthenticatedHandlerContext) => Promise<Response>

interface HandlerOptions {
  /** If true, validates Authorization header and injects user into context. */
  requireAuth?: boolean
}

/**
 * Creates a standardized Deno.serve handler that:
 * - Handles CORS preflight
 * - Parses JSON body
 * - Wraps errors in a consistent response
 * - Optionally validates authentication
 */
export function createHandler(fn: HandlerFn): (req: Request) => Promise<Response>
export function createHandler(fn: AuthenticatedHandlerFn, options: { requireAuth: true }): (req: Request) => Promise<Response>
export function createHandler(
  fn: HandlerFn | AuthenticatedHandlerFn,
  options: HandlerOptions = {}
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    try {
      // Parse body (empty object for GET/DELETE)
      let body: Record<string, unknown> = {}
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        try {
          body = await req.json()
        } catch {
          return errorResponse('Invalid JSON body', 400)
        }
      }

      // Auth check
      if (options.requireAuth) {
        const { getAuthenticatedUser } = await import('../auth/user.ts')
        const { createServiceClient } = await import('../db/client.ts')
        const supabase = createServiceClient()
        const user = await getAuthenticatedUser(req, supabase)
        if (!user) return errorResponse('Unauthorized', 401)
        return await (fn as AuthenticatedHandlerFn)({ req, body, user })
      }

      return await (fn as HandlerFn)({ req, body })
    } catch (error: unknown) {
      console.error('Unhandled error:', error)
      return errorResponse(
        error instanceof Error ? error.message : 'Internal server error',
        500
      )
    }
  }
}
