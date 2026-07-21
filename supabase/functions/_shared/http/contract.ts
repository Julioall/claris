export const API_CONTRACT_VERSION = '1' as const
export const API_VERSION_HEADER = 'x-claris-api-version'
export const CORRELATION_ID_HEADER = 'x-correlation-id'

export interface ApiSuccess<TData> {
  data: TData
  correlationId: string
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
  correlationId: string
}

export interface ApiFailure {
  error: ApiErrorBody
}

export interface PageRequest<TFilters = Record<string, never>> {
  page: number
  pageSize: number
  filters?: TFilters
}

export interface PageResult<TItem> {
  items: TItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export function isApiV1Request(req: Request): boolean {
  return req.headers.get(API_VERSION_HEADER) === API_CONTRACT_VERSION
}
