/**
 * HTTP utilities — CORS, responses, and handler factory.
 */
export {
	RequestBodyValidationError,
	expectBodyObject,
	readOptionalLiteral,
	readOptionalPositiveInteger,
	readOptionalString,
	readOptionalStringArray,
	readRequiredLiteral,
	readRequiredMoodleUrl,
	readRequiredPositiveInteger,
	readRequiredString,
	readRequiredStringArray,
} from './body.ts'
export { corsHeaders } from './cors.ts'
export {
	API_CONTRACT_VERSION,
	API_VERSION_HEADER,
	CORRELATION_ID_HEADER,
	isApiV1Request,
} from './contract.ts'
export type { ApiErrorBody, ApiFailure, ApiSuccess, PageRequest, PageResult } from './contract.ts'
export { ApiError } from './api-error.ts'
export { resolveCorrelationId, withCorrelationId } from './correlation.ts'
export { createRequestLogger } from './logger.ts'
export type { RequestLogger } from './logger.ts'
export { apiErrorResponse, apiSuccessResponse, jsonResponse, errorResponse } from './response.ts'
export { createHandler } from './handler.ts'
export type { HandlerContext, AuthenticatedHandlerContext } from './handler.ts'
