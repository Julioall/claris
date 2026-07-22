export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error) return false;

  const message = String((error as { message?: string })?.message || error).toLowerCase();
  return message.includes('invalid refresh token') || message.includes('refresh token not found');
}
