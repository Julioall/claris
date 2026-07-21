import { CORRELATION_ID_HEADER } from './contract.ts'

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/

export function resolveCorrelationId(
  req: Request,
  createId: () => string = (): string => crypto.randomUUID(),
): string {
  const received = req.headers.get(CORRELATION_ID_HEADER)?.trim()
  return received && SAFE_CORRELATION_ID.test(received) ? received : createId()
}

export function withCorrelationId(response: Response, correlationId: string): Response {
  const headers = new Headers(response.headers)
  headers.set(CORRELATION_ID_HEADER, correlationId)

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
