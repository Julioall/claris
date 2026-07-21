import type { AppSupabaseClient } from '../db/mod.ts'

export interface AuthUser {
  id: string
  email?: string
}

/**
 * Extracts and validates the authenticated user from the Authorization header.
 * Returns the user object or null if authentication fails.
 */
export async function getAuthenticatedUser(
  req: Request,
  supabase: AppSupabaseClient
): Promise<AuthUser | null> {
  const authHeader = req.headers.get('Authorization')
  const bearer = authHeader?.match(/^Bearer\s+(\S+)$/i)
  if (!bearer) return null

  const token = bearer[1]
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) return null
  return { id: user.id, email: user.email }
}
