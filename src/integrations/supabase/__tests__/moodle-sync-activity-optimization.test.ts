import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadActivityStaticSnapshot,
} from '../../../../supabase/functions/_shared/domain/moodle-sync/activity-static-snapshot.ts'

describe('Moodle activity synchronization optimization', () => {
  const callMoodleApiMock = vi.fn()

  beforeEach(() => {
    callMoodleApiMock.mockReset()
  })

  it('loads course metadata and due dates once into a reusable snapshot', async () => {
    callMoodleApiMock.mockImplementation(async (
      _url: string,
      _token: string,
      operation: string,
    ) => {
      if (operation === 'core_course_get_contents') {
        return [{
          modules: [
            { id: 11, modname: 'assign', name: 'Assignment' },
            { id: 12, modname: 'quiz', name: 'Quiz' },
            { id: 13, modname: 'forum', name: 'Forum' },
            { id: 14, modname: 'page', name: 'Ignored' },
          ],
        }]
      }
      if (operation === 'mod_assign_get_assignments') {
        return { courses: [{ assignments: [{ cmid: 11, duedate: 1_800_000_000 }] }] }
      }
      if (operation === 'mod_quiz_get_quizzes_by_courses') {
        return { quizzes: [{ coursemodule: 12, timeclose: 1_900_000_000 }] }
      }
      throw new Error(`Unexpected operation: ${operation}`)
    })

    const snapshot = await loadActivityStaticSnapshot(
      callMoodleApiMock,
      'https://moodle.test',
      'secret',
      42,
    )

    expect(snapshot.activities).toEqual([
      expect.objectContaining({ id: '11', name: 'Assignment', type: 'assign' }),
      expect.objectContaining({ id: '12', name: 'Quiz', type: 'quiz' }),
      { dueDate: null, id: '13', name: 'Forum', type: 'forum' },
    ])
    expect(callMoodleApiMock).toHaveBeenCalledTimes(3)
    expect(callMoodleApiMock.mock.calls.map((call) => call[2])).toEqual([
      'core_course_get_contents',
      'mod_assign_get_assignments',
      'mod_quiz_get_quizzes_by_courses',
    ])
  })

  it('reuses fallback responses for due dates without duplicate Moodle calls', async () => {
    callMoodleApiMock.mockImplementation(async (
      _url: string,
      _token: string,
      operation: string,
    ) => {
      if (operation === 'core_course_get_contents') throw new Error('unsupported')
      if (operation === 'mod_assign_get_assignments') {
        return {
          courses: [{
            assignments: [{ cmid: 21, duedate: 1_800_000_000, name: 'Fallback assignment' }],
          }],
        }
      }
      if (operation === 'mod_quiz_get_quizzes_by_courses') {
        return {
          quizzes: [{
            coursemodule: 22,
            name: 'Fallback quiz',
            timeclose: 1_900_000_000,
          }],
        }
      }
      if (operation === 'mod_forum_get_forums_by_courses') {
        return { forums: [{ cmid: 23, name: 'Fallback forum' }] }
      }
      throw new Error(`Unexpected operation: ${operation}`)
    })

    const snapshot = await loadActivityStaticSnapshot(
      callMoodleApiMock,
      'https://moodle.test',
      'secret',
      42,
    )

    expect(snapshot.activities).toEqual([
      expect.objectContaining({ dueDate: expect.any(String), id: '21', type: 'assign' }),
      expect.objectContaining({ dueDate: expect.any(String), id: '22', type: 'quiz' }),
      { dueDate: null, id: '23', name: 'Fallback forum', type: 'forum' },
    ])
    expect(callMoodleApiMock).toHaveBeenCalledTimes(4)
  })

  it('persists the snapshot in the durable cursor instead of refetching each page', () => {
    const runner = fs.readFileSync(path.join(
      process.cwd(),
      'supabase/functions/_shared/domain/moodle-sync/job-runner.ts',
    ), 'utf8')

    expect(runner).toContain('activity_static_snapshot')
    expect(runner).toContain('activityStaticSnapshot: state.activityStaticSnapshot')
    expect(runner).toContain('includeActivityStaticSnapshot: true')
  })
})
