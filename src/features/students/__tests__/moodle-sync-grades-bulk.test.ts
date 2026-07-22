import { describe, expect, it, vi } from 'vitest'

import { MoodleApiError } from '../../../../supabase/functions/_shared/moodle/mod.ts'
import {
  MAX_BULK_GRADE_ITEMS,
  MAX_BULK_GRADE_STUDENTS,
  tryFetchBulkGradeReports,
} from '../../../../supabase/functions/moodle-sync-grades/bulk.ts'
import {
  normalizeMoodleGradeReport,
} from '../../../../supabase/functions/moodle-sync-grades/records.ts'

const enrollments = [
  { moodle_user_id: '101', student_id: 'student-a' },
  { moodle_user_id: '202', student_id: 'student-b' },
]

describe('Moodle bulk grade fetch', () => {
  it('uses userid=0 exactly once and maps reports by Moodle user', async () => {
    const fetchGradeItems = vi.fn(async () => ({
      usergrades: [
        { userid: 202, gradeitems: [{ itemtype: 'course', graderaw: 7 }] },
        { userid: 101, gradeitems: [{ itemtype: 'course', graderaw: 9 }] },
      ],
    }))

    const result = await tryFetchBulkGradeReports(enrollments, fetchGradeItems)

    expect(fetchGradeItems).toHaveBeenCalledTimes(1)
    expect(fetchGradeItems).toHaveBeenCalledWith(0)
    expect(result.mode).toBe('bulk')
    if (result.mode === 'bulk') {
      expect(result.reportsByMoodleUserId.get('101')?.gradeitems?.[0]).toMatchObject({
        graderaw: 9,
      })
      expect(result.reportsByMoodleUserId.get('202')?.gradeitems?.[0]).toMatchObject({
        graderaw: 7,
      })
    }
  })

  it('falls back before the request when the enrollment payload is unsafe', async () => {
    const oversized = Array.from({ length: MAX_BULK_GRADE_STUDENTS + 1 }, (_, index) => ({
      moodle_user_id: String(index + 1),
      student_id: `student-${index + 1}`,
    }))
    const fetchGradeItems = vi.fn()

    await expect(tryFetchBulkGradeReports(oversized, fetchGradeItems)).resolves.toEqual({
      mode: 'individual',
      reason: 'enrollment_limit',
    })
    expect(fetchGradeItems).not.toHaveBeenCalled()
  })

  it('rejects a decoded payload that exceeds the in-memory grade item cap', async () => {
    const gradeitems = Array.from(
      { length: MAX_BULK_GRADE_ITEMS + 1 },
      () => ({ itemtype: 'mod' }),
    )
    const fetchGradeItems = vi.fn(async () => ({
      usergrades: [{ userid: 101, gradeitems }],
    }))

    await expect(tryFetchBulkGradeReports([enrollments[0]], fetchGradeItems)).resolves.toEqual({
      mode: 'individual',
      reason: 'memory_limit',
    })
  })

  it.each([
    ['permission', 'nopermissions', 'capability_denied'],
    ['invalid_payload', 'invalidparameter', 'unsupported_response'],
    ['response_too_large', 'response_too_large', 'response_limit'],
  ] as const)('allows controlled fallback for %s', async (category, code, reason) => {
    const fetchGradeItems = vi.fn(async () => {
      throw new MoodleApiError({ category, code, message: 'sanitized provider error' })
    })

    await expect(tryFetchBulkGradeReports(enrollments, fetchGradeItems)).resolves.toEqual({
      mode: 'individual',
      reason,
    })
    expect(fetchGradeItems).toHaveBeenCalledTimes(1)
  })

  it.each(['authentication', 'rate_limit', 'transient'] as const)(
    'does not fan out individual calls after a %s failure',
    async (category) => {
      const providerError = new MoodleApiError({
        category,
        code: `test_${category}`,
        message: 'sanitized provider error',
      })
      const fetchGradeItems = vi.fn(async () => { throw providerError })

      await expect(tryFetchBulkGradeReports(enrollments, fetchGradeItems)).rejects.toBe(providerError)
      expect(fetchGradeItems).toHaveBeenCalledTimes(1)
    },
  )

  it('accepts missing reports because suspended Moodle users can be absent from bulk', async () => {
    const senaiEnrollments = Array.from({ length: 24 }, (_, index) => ({
      moodle_user_id: String(index + 1),
      student_id: `senai-student-${index + 1}`,
    }))
    const fetchGradeItems = vi.fn(async () => ({
      // Read-only validation of course 8862 returned 13 usergrades for 24
      // students; the remaining 11 enrolments were suspended.
      usergrades: senaiEnrollments.slice(0, 13).map((enrollment) => ({
        userid: Number(enrollment.moodle_user_id),
        gradeitems: [],
      })),
    }))

    const result = await tryFetchBulkGradeReports(senaiEnrollments, fetchGradeItems)
    expect(result.mode).toBe('bulk')
    if (result.mode === 'bulk') {
      expect(result.reportsByMoodleUserId.size).toBe(13)
    }
  })

  it('uses individual fallback when a returned report has no usable user id', async () => {
    const fetchGradeItems = vi.fn(async () => ({
      usergrades: [{ gradeitems: [] }],
    }))

    await expect(tryFetchBulkGradeReports(enrollments, fetchGradeItems)).resolves.toEqual({
      mode: 'individual',
      reason: 'ambiguous_response',
    })
  })
})

describe('Moodle 4.5/5.1 grade normalization', () => {
  const context = {
    clarisCourseId: 'course-id',
    studentId: 'student-id',
    syncedAt: '2026-07-21T12:00:00.000Z',
  }

  it('keeps absent Moodle 4.5 optional fields null instead of inventing zeroes', () => {
    const result = normalizeMoodleGradeReport({
      userid: 101,
      gradeitems: [
        {
          itemtype: 'course',
          gradeformatted: '-',
        },
        {
          cmid: 55,
          itemtype: 'mod',
          itemmodule: 'assign',
          itemname: 'Atividade sem nota',
          graderaw: null,
        },
      ],
    }, context)

    expect(result.courseGradeRecord).toMatchObject({
      grade_raw: null,
      grade_max: null,
      grade_percentage: null,
    })
    expect(result.activityRecords[0]).toMatchObject({
      grade: null,
      grade_max: null,
      percentage: null,
    })
  })

  it('normalizes Moodle 5.1 values and only derives percentage with a denominator', () => {
    const result = normalizeMoodleGradeReport({
      userid: '202',
      gradeitems: [
        {
          itemtype: 'course',
          graderaw: 85,
          grademax: 100,
          percentageformatted: '85,00 %',
        },
        {
          cmid: 88,
          itemtype: 'mod',
          itemmodule: 'quiz',
          itemname: 'Questionario',
          graderaw: '8.5',
          grademax: '10',
          gradedategraded: 1_752_494_400,
        },
      ],
    }, context)

    expect(result.courseGradeRecord.grade_percentage).toBe(85)
    expect(result.activityRecords[0]).toMatchObject({
      grade: 8.5,
      grade_max: 10,
      percentage: 85,
      status: 'graded',
    })
  })
})
