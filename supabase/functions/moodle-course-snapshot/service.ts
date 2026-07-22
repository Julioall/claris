import { ApiError } from '../_shared/http/mod.ts'
import {
  MOODLE_COURSE_SNAPSHOT_CONTRACT_VERSION,
  type EntityFreshnessDto,
  type MoodleSnapshotEntity,
} from './contract.ts'
import type { MoodleCourseSnapshotPayload } from './payload.ts'
import type { RefreshRequestResult, SnapshotRepository } from './repository.ts'

function mapRefresh(result: RefreshRequestResult) {
  return {
    jobId: result.job_id,
    retryAfterSeconds: result.retry_after_seconds,
    status: result.refresh_status,
  }
}

function needsRefresh(freshness: EntityFreshnessDto[]): MoodleSnapshotEntity[] {
  return freshness
    .filter((entry) => entry.state === 'stale' || entry.state === 'never_synced')
    .map((entry) => entry.entity)
}

export async function executeMoodleCourseSnapshot(
  repository: SnapshotRepository,
  actorId: string,
  payload: MoodleCourseSnapshotPayload,
  now = new Date(),
): Promise<{ body: Record<string, unknown>; status: number; retryAfterSeconds?: number }> {
  if (payload.action === 'request_course_refresh') {
    const refresh = await repository.requestRefresh(
      actorId, payload.connectionId, payload.courseId, payload.entities, 'manual',
    )
    if (refresh.refresh_status === 'cooldown') {
      return {
        body: {
          contractVersion: MOODLE_COURSE_SNAPSHOT_CONTRACT_VERSION,
          code: 'moodle_refresh_cooldown',
          message: 'Course refresh is in cooldown.',
          retryAfterSeconds: refresh.retry_after_seconds,
        },
        retryAfterSeconds: refresh.retry_after_seconds ?? 60,
        status: 429,
      }
    }
    return {
      body: {
        acceptedEntities: refresh.accepted_entities,
        contractVersion: MOODLE_COURSE_SNAPSHOT_CONTRACT_VERSION,
        jobId: refresh.job_id,
        requestedAt: refresh.requested_at,
        status: refresh.refresh_status,
      },
      status: 202,
    }
  }

  await repository.reclassify(payload.connectionId, payload.courseId)
  const snapshot = await repository.getSnapshot(payload.connectionId, payload.courseId, payload.entities)
  if (!snapshot.connection) throw new ApiError('moodle_connection_not_found', 'Moodle connection not found.', 404)
  if (!snapshot.course) throw ApiError.notFound('Course not found.')
  if (snapshot.course.moodle_site_id !== snapshot.connection.moodle_site_id) {
    throw new ApiError('sync_course_site_mismatch', 'Course is outside the Moodle connection site.', 403)
  }

  const watermarkByEntity = new Map(snapshot.watermarks.map((entry) => [entry.entity, entry]))
  const staleByEntity = new Map(snapshot.policies.map((entry) => [entry.entity, entry.stale_after_seconds]))
  const freshness: EntityFreshnessDto[] = payload.entities.map((entity) => {
    const watermark = watermarkByEntity.get(entity)
    const active = snapshot.activeJobs.find((job) => job.entities.includes(entity))
    const last = watermark?.last_successful_sync_at ?? null
    const staleAt = last
      ? new Date(new Date(last).getTime() + (staleByEntity.get(entity) ?? 86_400) * 1000).toISOString()
      : null
    const state = active
      ? 'refreshing' as const
      : !last
      ? 'never_synced' as const
      : staleAt && new Date(staleAt).getTime() <= now.getTime()
      ? 'stale' as const
      : 'fresh' as const
    return {
      entity,
      lastErrorCode: snapshot.errorCodes[entity] ?? null,
      lastSuccessfulSyncAt: last,
      observedAt: snapshot.course?.observed_at ?? null,
      refreshJobId: active?.id ?? null,
      sourceUpdatedAt: snapshot.course?.source_updated_at ?? null,
      staleAt,
      state,
    }
  })

  let refresh: RefreshRequestResult | null = null
  const staleEntities = needsRefresh(freshness)
  if (payload.refreshPolicy === 'if_stale' && staleEntities.length > 0) {
    refresh = await repository.requestRefresh(
      actorId, payload.connectionId, payload.courseId, staleEntities, 'stale_read',
    )
  }

  return {
    body: {
      connectionId: payload.connectionId,
      contractVersion: MOODLE_COURSE_SNAPSHOT_CONTRACT_VERSION,
      courseId: payload.courseId,
      data: {
        course: {
          category: snapshot.course.category,
          endDate: snapshot.course.end_date,
          name: snapshot.course.name,
          observedAt: snapshot.course.observed_at,
          shortName: snapshot.course.short_name,
          sourceUpdatedAt: snapshot.course.source_updated_at,
          startDate: snapshot.course.start_date,
        },
        counts: snapshot.counts,
      },
      freshness,
      refresh: refresh
        ? mapRefresh(refresh)
        : { jobId: null, retryAfterSeconds: null, status: 'not_requested' },
      siteId: snapshot.connection.moodle_site_id,
    },
    status: 200,
  }
}

