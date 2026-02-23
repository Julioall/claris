import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  supabase: SupabaseClient
): Promise<AuthUser | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const token = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) return null
  return { id: user.id, email: user.email }
}
