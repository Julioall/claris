import type {
  MoodleUserGradeReport,
} from '../../../../supabase/functions/moodle-sync-grades/bulk.ts'

// These are the read-only functions exercised by the Moodle synchronization
// path.  Keeping the list here makes the version fixtures an executable
// contract instead of a small, disconnected sample of site-info output.
export const MOODLE_SYNC_REQUIRED_OPERATIONS = [
  'core_webservice_get_site_info',
  'core_enrol_get_users_courses',
  'core_course_get_categories',
  'core_enrol_get_enrolled_users',
  'core_user_get_users_by_field',
  'core_course_get_contents',
  'core_completion_get_activities_completion_status',
  'gradereport_user_get_grade_items',
  'mod_assign_get_assignments',
  'mod_quiz_get_quizzes_by_courses',
  'mod_forum_get_forums_by_courses',
  'core_course_get_updates_since',
] as const

export type MoodleSyncOperation = typeof MOODLE_SYNC_REQUIRED_OPERATIONS[number]

export interface MoodleExceptionFixture {
  errorcode: string
  exception: string
  message: string
}

export interface MoodleOperationFixture {
  failure: MoodleExceptionFixture
  success: unknown
}

export interface SanitizedMoodleSyncFixture {
  ambiguousDelta: { instances: unknown[]; warnings: Array<{ warningcode: string }> }
  enrolledUsers: Array<{
    id: number
    roles?: Array<{ name: string; shortname?: string }>
    suspended?: boolean
  }>
  exception: MoodleExceptionFixture
  gradeReport: MoodleUserGradeReport
  operationContracts: Record<MoodleSyncOperation, MoodleOperationFixture>
  release: string
  siteInfo: {
    functions: Array<{ name: string }>
    release: string
    version: string
  }
}

function createOperationContracts(input: {
  enrolledUsers: SanitizedMoodleSyncFixture['enrolledUsers']
  exception: MoodleExceptionFixture
  gradeReport: MoodleUserGradeReport
  siteInfo: SanitizedMoodleSyncFixture['siteInfo']
}) {
  const courseContents = [{
    modules: [
      { id: 401, modname: 'assign', name: 'Synthetic assignment' },
      { id: 402, modname: 'quiz', name: 'Synthetic quiz' },
      { id: 403, modname: 'forum', name: 'Synthetic forum' },
    ],
  }]
  const successByOperation: Record<MoodleSyncOperation, unknown> = {
    core_webservice_get_site_info: input.siteInfo,
    core_enrol_get_users_courses: [],
    core_course_get_categories: [],
    core_enrol_get_enrolled_users: input.enrolledUsers,
    core_user_get_users_by_field: [],
    core_course_get_contents: courseContents,
    core_completion_get_activities_completion_status: { statuses: [] },
    gradereport_user_get_grade_items: { usergrades: [input.gradeReport] },
    mod_assign_get_assignments: {
      courses: [{ assignments: [{ cmid: 401, duedate: 1_800_000_000, name: 'Synthetic assignment' }] }],
    },
    mod_quiz_get_quizzes_by_courses: {
      quizzes: [{ coursemodule: 402, name: 'Synthetic quiz', timeclose: 1_900_000_000 }],
    },
    mod_forum_get_forums_by_courses: {
      forums: [{ cmid: 403, name: 'Synthetic forum' }],
    },
    core_course_get_updates_since: { instances: [], warnings: [] },
  }

  return Object.fromEntries(MOODLE_SYNC_REQUIRED_OPERATIONS.map((operation) => [
    operation,
    { failure: input.exception, success: successByOperation[operation] },
  ])) as Record<MoodleSyncOperation, MoodleOperationFixture>
}

const moodle45Exception: MoodleExceptionFixture = {
  errorcode: 'invalidparameter',
  exception: 'invalid_parameter_exception',
  message: 'Sanitized fixture error',
}

const moodle45GradeReport: MoodleUserGradeReport = {
  userid: 101,
  gradeitems: [
    { gradeformatted: '-', itemtype: 'course' },
    {
      cmid: 451,
      graderaw: null,
      itemmodule: 'assign',
      itemname: 'Synthetic assignment',
      itemtype: 'mod',
    },
  ],
}

const moodle45SiteInfo: SanitizedMoodleSyncFixture['siteInfo'] = {
  functions: MOODLE_SYNC_REQUIRED_OPERATIONS.map((name) => ({ name })),
  release: '4.5.5 (Build: 20250609)',
  version: '2024100705',
}

export const moodle45Fixture: SanitizedMoodleSyncFixture = {
  ambiguousDelta: {
    instances: [],
    warnings: [{ warningcode: 'cannotviewmodule' }],
  },
  enrolledUsers: [
    { id: 101, roles: [{ name: 'Aluno', shortname: 'student' }] },
    { id: 102, roles: [{ name: 'Tutor', shortname: 'teacher' }] },
    { id: 103 },
  ],
  exception: moodle45Exception,
  gradeReport: moodle45GradeReport,
  operationContracts: createOperationContracts({
    enrolledUsers: [
      { id: 101, roles: [{ name: 'Aluno', shortname: 'student' }] },
      { id: 102, roles: [{ name: 'Tutor', shortname: 'teacher' }] },
      { id: 103 },
    ],
    exception: moodle45Exception,
    gradeReport: moodle45GradeReport,
    siteInfo: moodle45SiteInfo,
  }),
  release: '4.5.5',
  siteInfo: moodle45SiteInfo,
}

const moodle51Exception: MoodleExceptionFixture = {
  errorcode: 'invalidparameter',
  exception: 'invalid_parameter_exception',
  message: 'Sanitized fixture error',
}

const moodle51GradeReport: MoodleUserGradeReport = {
  userid: 201,
  gradeitems: [
    {
      gradeformatted: '85.00',
      grademax: 100,
      graderaw: 85,
      itemtype: 'course',
      percentageformatted: '85.00 %',
    },
    {
      cmid: 511,
      gradedategraded: 1_752_494_400,
      grademax: 10,
      graderaw: 8.5,
      itemmodule: 'quiz',
      itemname: 'Synthetic quiz',
      itemtype: 'mod',
    },
  ],
}

const moodle51SiteInfo: SanitizedMoodleSyncFixture['siteInfo'] = {
  functions: MOODLE_SYNC_REQUIRED_OPERATIONS.map((name) => ({ name })),
  release: '5.1.2 (Build: 20260209)',
  version: '2025100602',
}

export const moodle51Fixture: SanitizedMoodleSyncFixture = {
  ambiguousDelta: {
    instances: [],
    warnings: [{ warningcode: 'cannotviewmodule' }],
  },
  enrolledUsers: [
    {
      id: 201,
      roles: [{ name: 'Student', shortname: 'student' }],
      suspended: false,
    },
    {
      id: 202,
      roles: [{ name: 'Editing teacher', shortname: 'editingteacher' }],
      suspended: false,
    },
  ],
  exception: moodle51Exception,
  gradeReport: moodle51GradeReport,
  operationContracts: createOperationContracts({
    enrolledUsers: [
      {
        id: 201,
        roles: [{ name: 'Student', shortname: 'student' }],
        suspended: false,
      },
      {
        id: 202,
        roles: [{ name: 'Editing teacher', shortname: 'editingteacher' }],
        suspended: false,
      },
    ],
    exception: moodle51Exception,
    gradeReport: moodle51GradeReport,
    siteInfo: moodle51SiteInfo,
  }),
  release: '5.1.2',
  siteInfo: moodle51SiteInfo,
}

export const oversizedGradeFixture = {
  studentCount: 501,
  totalGradeItems: 50_001,
}
