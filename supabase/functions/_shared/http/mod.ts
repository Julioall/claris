/**
 * HTTP utilities — CORS, responses, and handler factory.
 */
export { corsHeaders } from './cors.ts'
export { jsonResponse, errorResponse } from './response.ts'
export { createHandler } from './handler.ts'
export type { HandlerContext, AuthenticatedHandlerContext } from './handler.ts'
