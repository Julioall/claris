import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { evaluateDeltaShadow } from '../../../../supabase/functions/_shared/domain/moodle-sync/delta-shadow.ts'
import { isStudentLikeUser } from '../../../../supabase/functions/_shared/moodle/student-role.ts'
import { normalizeMoodleGradeReport } from '../../../../supabase/functions/moodle-sync-grades/records.ts'
import {
  MOODLE_SYNC_REQUIRED_OPERATIONS,
  moodle45Fixture,
  moodle51Fixture,
  oversizedGradeFixture,
} from '../../../test/fixtures/moodle-sync-contracts.ts'

const context = {
  clarisCourseId: '11111111-1111-4111-8111-111111111111',
  studentId: '22222222-2222-4222-8222-222222222222',
  syncedAt: '2026-07-26T12:00:00.000Z',
}

describe.each([
  ['Moodle 4.5', 'senai', moodle45Fixture],
  ['Moodle 5.1', 'fieg', moodle51Fixture],
])('%s sanitized sync fixture', (_label, siteKey, fixture) => {
  it('keeps every required read-only operation represented with a sanitized success and failure', () => {
    expect(Object.keys(fixture.operationContracts)).toEqual(MOODLE_SYNC_REQUIRED_OPERATIONS)
    expect(fixture.siteInfo.functions.map((item) => item.name)).toEqual(MOODLE_SYNC_REQUIRED_OPERATIONS)

    for (const operation of MOODLE_SYNC_REQUIRED_OPERATIONS) {
      const contract = fixture.operationContracts[operation]
      expect(contract.success).not.toBeUndefined()
      expect(contract.failure).toEqual(fixture.exception)
    }
  })

  it('agrees with the versioned, read-only capability evidence for its Moodle site', () => {
    const evidencePath = path.join(
      process.cwd(),
      'docs/benchmarks/moodle-readonly-validation-2026-07-21.json',
    )
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as {
      requiredCapabilities: Record<string, Record<string, boolean>>
      sites: Record<string, { release: string }>
    }

    expect(evidence.sites[siteKey]?.release).toContain(fixture.release)
    for (const operation of MOODLE_SYNC_REQUIRED_OPERATIONS) {
      expect(evidence.requiredCapabilities[operation]?.[siteKey]).toBe(true)
    }
  })

  it('contains success, role ambiguity, warning and exception contracts', () => {
    expect(fixture.siteInfo.release).toContain(fixture.release)
    expect(fixture.siteInfo.functions.length).toBeGreaterThan(0)
    expect(fixture.enrolledUsers.some((user) => isStudentLikeUser(user))).toBe(true)
    expect(fixture.enrolledUsers.some((user) => !isStudentLikeUser(user))).toBe(true)
    expect(fixture.ambiguousDelta.warnings).not.toHaveLength(0)
    expect(fixture.exception).toMatchObject({
      errorcode: 'invalidparameter',
      exception: 'invalid_parameter_exception',
    })
  })

  it('normalizes optional grade fields without inventing academic values', () => {
    const result = normalizeMoodleGradeReport(fixture.gradeReport, context)
    expect(result.courseGradeRecord.student_id).toBe(context.studentId)
    expect(result.activityRecords).toHaveLength(1)
    for (const value of [
      result.courseGradeRecord.grade_raw,
      result.courseGradeRecord.grade_max,
      result.courseGradeRecord.grade_percentage,
    ]) {
      expect(value === null || Number.isFinite(value)).toBe(true)
    }
  })

  it('forces full sync when the provider returns a warning', () => {
    expect(evaluateDeltaShadow({
      capabilityAvailable: true,
      currentRelease: fixture.release,
      response: fixture.ambiguousDelta,
      watermarkRelease: fixture.release,
      watermarkSince: '2026-07-26T12:00:00.000Z',
    })).toEqual({ mode: 'full', reason: 'warning' })
  })
})

describe('large sanitized Moodle payload fixture', () => {
  it('covers the controlled 500+ student and bounded-memory scenario', () => {
    expect(oversizedGradeFixture.studentCount).toBeGreaterThan(500)
    expect(oversizedGradeFixture.totalGradeItems).toBeGreaterThan(50_000)
  })
})
