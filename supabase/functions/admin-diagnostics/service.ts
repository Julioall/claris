import { ApiError } from '../_shared/http/mod.ts'
import {
  ADMIN_DIAGNOSTICS_CONTRACT_VERSION,
  type GradeDiagnosticCoursesDto,
  type GradeDiagnosticResultDto,
  type GradeDiagnosticStudentsDto,
} from './contract.ts'
import type { GradeDiagnosticGateway } from './gateway.ts'
import { mapGradeDiagnosticResult } from './mapper.ts'
import type { AdminDiagnosticsPayload } from './payload.ts'
import type { AdminDiagnosticsRepository } from './repository.ts'
import type { AppSupabaseClient } from '../_shared/db/mod.ts'
import { resolveOwnedMoodleConnectionScope } from '../_shared/domain/moodle-connections/scope.ts'

type AdminDiagnosticsResult =
  | GradeDiagnosticCoursesDto
  | GradeDiagnosticResultDto
  | GradeDiagnosticStudentsDto

export async function executeAdminDiagnostics(
  repository: AdminDiagnosticsRepository,
  gateway: GradeDiagnosticGateway,
  db: AppSupabaseClient,
  actorId: string,
  correlationId: string,
  payload: AdminDiagnosticsPayload,
): Promise<AdminDiagnosticsResult> {
  const scope = await resolveOwnedMoodleConnectionScope(db, actorId, payload.connectionId)
  if (payload.action === 'list_grade_courses') {
    return {
      contractVersion: ADMIN_DIAGNOSTICS_CONTRACT_VERSION,
      items: (await repository.listGradeCourses(scope.moodleSiteId)).map((course) => ({
        id: course.id,
        name: course.name,
      })),
    }
  }

  if (payload.action === 'list_grade_students') {
    const students = await repository.listGradeStudents(scope.moodleSiteId, payload.courseId)
    if (!students) throw ApiError.notFound('Curso não encontrado.')
    return {
      contractVersion: ADMIN_DIAGNOSTICS_CONTRACT_VERSION,
      items: students.map((student) => ({
        id: student.id,
        fullName: student.fullName,
      })),
    }
  }

  const target = await repository.findGradeDiagnosticTarget(
    scope.moodleSiteId,
    payload.courseId,
    payload.studentId,
  )
  if (!target) throw ApiError.notFound('Curso, aluno ou matrícula não encontrado.')

  const operationId = crypto.randomUUID()
  await repository.recordAudit({
    actorId,
    correlationId,
    details: { courseId: target.course.id, studentId: target.student.id },
    operation: 'grade_diagnostic',
    operationId,
    phase: 'requested',
    status: 'pending',
  })

  try {
    const result = mapGradeDiagnosticResult(
      await gateway.fetchGrades(actorId, scope.connectionId, target),
      operationId,
      target,
    )
    await repository.recordAudit({
      actorId,
      correlationId,
      details: {
        courseId: target.course.id,
        returnedItems: result.summary.returnedItems,
        studentId: target.student.id,
      },
      operation: 'grade_diagnostic',
      operationId,
      phase: 'completed',
      status: 'success',
    })
    return {
      contractVersion: ADMIN_DIAGNOSTICS_CONTRACT_VERSION,
      ...result,
    }
  } catch (error) {
    await repository.recordAudit({
      actorId,
      correlationId,
      details: { courseId: target.course.id, studentId: target.student.id },
      operation: 'grade_diagnostic',
      operationId,
      phase: 'failed',
      status: 'failed',
    }).catch(() => undefined)
    throw error
  }
}
