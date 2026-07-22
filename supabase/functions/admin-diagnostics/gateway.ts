import { resolveMoodleAccess } from '../_shared/domain/moodle-connections/access.ts'
import type { AppSupabaseClient } from '../_shared/db/mod.ts'
import { ApiError } from '../_shared/http/mod.ts'
import { callMoodleApi } from '../_shared/moodle/mod.ts'
import type { GradeDiagnosticTarget } from './repository.ts'

export interface GradeDiagnosticGateway {
  fetchGrades(actorId: string, connectionId: string, target: GradeDiagnosticTarget): Promise<unknown>
}

export function createGradeDiagnosticGateway(
  supabase: AppSupabaseClient,
): GradeDiagnosticGateway {
  return {
    async fetchGrades(actorId, connectionId, target) {
      let access
      try {
        access = await resolveMoodleAccess(supabase, actorId, connectionId)
      } catch (error) {
        throw ApiError.conflict(
          error instanceof Error
            ? error.message
            : 'Não foi possível acessar o Moodle pelo servidor.',
        )
      }

      try {
        return await callMoodleApi(
          access.moodleUrl,
          access.token,
          'gradereport_user_get_grade_items',
          {
            courseid: target.course.moodleCourseId,
            userid: target.student.moodleUserId,
          },
        )
      } catch (error) {
        console.error('Moodle grade diagnostic failed.', {
          courseId: target.course.id,
          message: error instanceof Error ? error.message : 'Unknown Moodle error',
          studentId: target.student.id,
        })
        throw new ApiError(
          'upstream_unavailable',
          'O Moodle não está disponível para o diagnóstico no momento.',
          502,
        )
      }
    },
  }
}
