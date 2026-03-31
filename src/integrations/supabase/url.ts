const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '0.0.0.0']);

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

export function resolveSupabaseUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);

  if (typeof window !== 'undefined') {
    const browserHostname = window.location.hostname;
    if (isLocalHostname(parsed.hostname) && !isLocalHostname(browserHostname)) {
      parsed.hostname = browserHostname;
    }
  }

  return parsed.toString().replace(/\/$/, '');
}

export const SUPABASE_URL = resolveSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string);
