export class ApiError extends Error {
  readonly code: string
  readonly details?: unknown
  readonly status: number

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
    this.status = status
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError('forbidden', message, 403)
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError('not_found', message, 404)
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError('conflict', message, 409, details)
  }

  static unprocessable(message: string, details?: unknown): ApiError {
    return new ApiError('validation_failed', message, 422, details)
  }
}
