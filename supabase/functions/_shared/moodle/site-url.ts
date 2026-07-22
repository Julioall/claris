export function normalizeApprovedMoodleBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Invalid Moodle site URL.')
  }

  const hostname = url.hostname.toLowerCase()
  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  const isIpv6Literal = hostname.includes(':')
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
    || url.pathname !== '/'
    || url.search
    || url.hash
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || isIpv6Literal
    || isIpv4
  ) {
    throw new Error('Moodle site URL is not allowed.')
  }

  return `https://${hostname}`
}
