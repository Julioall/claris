/**
 * Keep invitation links inside the Claris account flow. Supabase Auth also
 * enforces its redirect allowlist; this validation catches a bad deployment
 * environment before it can silently fall back to the generic site URL.
 */
export function normalizeClarisInviteRedirect(rawValue: string): string {
  const raw = rawValue.trim()
  if (!raw) throw new Error('CLARIS_INVITE_REDIRECT_URL is not configured')

  let redirect: URL
  try {
    redirect = new URL(raw)
  } catch {
    throw new Error('CLARIS_INVITE_REDIRECT_URL must be an absolute HTTPS URL')
  }

  if (
    redirect.protocol !== 'https:' ||
    redirect.username ||
    redirect.password ||
    redirect.pathname !== '/auth/accept-invite' ||
    redirect.search ||
    redirect.hash
  ) {
    throw new Error('CLARIS_INVITE_REDIRECT_URL must be an HTTPS /auth/accept-invite URL without credentials, query, or fragment')
  }

  return redirect.toString()
}
