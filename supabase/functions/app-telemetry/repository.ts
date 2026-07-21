import { createServiceClient } from '../_shared/db/mod.ts'
import type {
  TelemetryAttributes,
  TelemetryErrorCategory,
  TelemetryErrorSeverity,
} from './contract.ts'

export interface UsageEventRecord {
  eventType: string
  metadata: TelemetryAttributes
  resource: string | null
  route: string | null
  userId: string
}

export interface ErrorLogRecord {
  category: TelemetryErrorCategory
  context: TelemetryAttributes
  message: string
  payload: TelemetryAttributes
  severity: TelemetryErrorSeverity
  userId: string
}

export interface AppTelemetryRepository {
  insertErrorLog(record: ErrorLogRecord): Promise<void>
  insertUsageEvent(record: UsageEventRecord): Promise<void>
}

export function createAppTelemetryRepository(): AppTelemetryRepository {
  const supabase = createServiceClient()

  return {
    async insertErrorLog(record) {
      const { error } = await supabase.from('app_error_logs').insert({
        category: record.category,
        context: record.context,
        message: record.message,
        payload: record.payload,
        severity: record.severity,
        user_id: record.userId,
      })
      if (error) throw error
    },

    async insertUsageEvent(record) {
      const { error } = await supabase.from('app_usage_events').insert({
        event_type: record.eventType,
        metadata: record.metadata,
        resource: record.resource,
        route: record.route,
        user_id: record.userId,
      })
      if (error) throw error
    },
  }
}
