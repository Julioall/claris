import { createHash } from 'node:crypto'

export const MOODLE_SYNC_SYNTHETIC_BENCHMARK_VERSION = 1

const ACTIVITY_BATCH_SIZE = 12
const ACTIVITY_UPSERT_BATCH_SIZE = 500
const GRADE_ACTIVITY_COUNT_PER_STUDENT = 8
const GRADE_ACTIVITY_UPSERT_BATCH_SIZE = 200
const COURSE_GRADE_UPSERT_BATCH_SIZE = 100
const METADATA_API_CALLS = 3

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function batchesFor(rowCount, batchSize) {
  return rowCount === 0 ? 0 : Math.ceil(rowCount / batchSize)
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} deve ser um inteiro nao negativo.`)
  }
  return value
}

function makeStaticActivities() {
  return Array.from({ length: 12 }, (_, index) => ({
    dueDate: index % 3 === 2 ? null : `2026-12-${String((index % 28) + 1).padStart(2, '0')}T23:59:00.000Z`,
    id: String(index + 1),
    name: `Atividade sintetica ${index + 1}`,
    type: ['assign', 'quiz', 'forum'][index % 3],
  }))
}

function makeStudents(count) {
  return Array.from({ length: count }, (_, index) => ({
    moodleUserId: index + 10_000,
    studentId: `student-${String(index + 1).padStart(4, '0')}`,
  }))
}

function makeCompletionRecord(activity, student, observedAt) {
  const completed = student.moodleUserId % 3 !== 0
  const stableContent = {
    activity_name: activity.name,
    activity_type: activity.type,
    completed_at: completed ? '2026-07-01T12:00:00.000Z' : null,
    due_date: activity.dueDate,
    hidden: false,
    status: completed ? 'completed' : 'pending',
  }
  return {
    ...stableContent,
    content_hash: hash(stableContent),
    course_id: 'synthetic-course',
    last_synced_connection_id: 'synthetic-connection',
    moodle_activity_id: activity.id,
    observed_at: observedAt,
    student_id: student.studentId,
  }
}

function makeGradeRecords(student, observedAt) {
  const activityRecords = Array.from({ length: GRADE_ACTIVITY_COUNT_PER_STUDENT }, (_, index) => {
    const stableContent = {
      activity_name: `Nota sintetica ${index + 1}`,
      activity_type: index % 2 === 0 ? 'assign' : 'quiz',
      completed_at: '2026-07-01T12:00:00.000Z',
      grade: 60 + ((student.moodleUserId + index) % 40),
      grade_max: 100,
      graded_at: '2026-07-02T12:00:00.000Z',
      hidden: false,
      percentage: 60 + ((student.moodleUserId + index) % 40),
      status: 'completed',
      submitted_at: '2026-07-01T12:00:00.000Z',
    }
    return {
      ...stableContent,
      content_hash: hash(stableContent),
      course_id: 'synthetic-course',
      last_synced_connection_id: 'synthetic-connection',
      moodle_activity_id: `grade-${index + 1}`,
      observed_at: observedAt,
      student_id: student.studentId,
    }
  })
  const stableCourseGrade = {
    grade_formatted: '80.00',
    grade_max: 100,
    grade_percentage: 80,
    grade_raw: 80,
    letter_grade: 'B',
  }
  return {
    activityRecords,
    courseGradeRecord: {
      ...stableCourseGrade,
      content_hash: hash(stableCourseGrade),
      course_id: 'synthetic-course',
      last_synced_connection_id: 'synthetic-connection',
      observed_at: observedAt,
      student_id: student.studentId,
    },
  }
}

/**
 * Runs the CPU/data-shaping part of a representative Moodle job locally.
 * It deliberately does not create a network client or access a Moodle URL.
 */
export function runSyntheticMoodleSyncScenario(studentCount) {
  const students = makeStudents(positiveInteger(studentCount, 'studentCount'))
  const startedAt = performance.now()
  const heapStart = process.memoryUsage().heapUsed
  let peakHeap = heapStart
  const observeHeap = () => {
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed)
  }

  if (students.length === 0) {
    return {
      benchmarkVersion: MOODLE_SYNC_SYNTHETIC_BENCHMARK_VERSION,
      metrics: {
        activityMetadataApiCalls: 0,
        activityMetadataCacheReuses: 0,
        activityUpsertBatches: 0,
        bulkGradeApiCalls: 0,
        completionApiCalls: 0,
        courseGradeUpsertBatches: 0,
        gradeActivityUpsertBatches: 0,
        gradeFallbackApiCalls: 0,
        moodleApiCalls: 0,
        rows: {
          activityCompletion: 0,
          courseGrades: 0,
          gradeActivities: 0,
          total: 0,
        },
      },
      studentCount,
      timing: {
        heapDeltaBytes: Math.max(0, peakHeap - heapStart),
        wallMs: Number((performance.now() - startedAt).toFixed(2)),
      },
    }
  }

  // These are exactly the normal-path operations of loadActivityStaticSnapshot:
  // contents, assignment due dates and quiz due dates. The snapshot is then kept
  // by the worker cursor for every following activity page.
  const activities = makeStaticActivities()
  const observedAt = '2026-07-26T00:00:00.000Z'
  let activityCompletionRows = 0
  let activityUpsertBatches = 0
  let activityPages = 0

  for (let start = 0; start < students.length; start += ACTIVITY_BATCH_SIZE) {
    const page = students.slice(start, start + ACTIVITY_BATCH_SIZE)
    const records = []
    for (const activity of activities) {
      for (const student of page) records.push(makeCompletionRecord(activity, student, observedAt))
    }
    activityPages += 1
    activityCompletionRows += records.length
    activityUpsertBatches += batchesFor(records.length, ACTIVITY_UPSERT_BATCH_SIZE)
    observeHeap()
  }

  // The principal grade path makes one bulk Moodle request per course, then
  // normalizes every report before writing activity and course grade batches.
  const normalizedGrades = students.map((student) => makeGradeRecords(student, observedAt))
  observeHeap()
  const gradeActivityRows = normalizedGrades.flatMap((result) => result.activityRecords).length
  const courseGradeRows = normalizedGrades.length

  const metrics = {
    activityMetadataApiCalls: METADATA_API_CALLS,
    activityMetadataCacheReuses: Math.max(0, activityPages - 1),
    activityUpsertBatches,
    bulkGradeApiCalls: 1,
    completionApiCalls: students.length,
    courseGradeUpsertBatches: batchesFor(courseGradeRows, COURSE_GRADE_UPSERT_BATCH_SIZE),
    gradeActivityUpsertBatches: batchesFor(gradeActivityRows, GRADE_ACTIVITY_UPSERT_BATCH_SIZE),
    gradeFallbackApiCalls: 0,
    moodleApiCalls: METADATA_API_CALLS + 1 + students.length,
    rows: {
      activityCompletion: activityCompletionRows,
      courseGrades: courseGradeRows,
      gradeActivities: gradeActivityRows,
      total: activityCompletionRows + courseGradeRows + gradeActivityRows,
    },
  }

  return {
    benchmarkVersion: MOODLE_SYNC_SYNTHETIC_BENCHMARK_VERSION,
    metrics,
    studentCount,
    timing: {
      heapDeltaBytes: Math.max(0, peakHeap - heapStart),
      wallMs: Number((performance.now() - startedAt).toFixed(2)),
    },
  }
}

export function verifySyntheticMoodleSyncScenario(result, scenario) {
  if (!result || typeof result !== 'object') throw new Error('Resultado do benchmark invalido.')
  if (!scenario || typeof scenario !== 'object') throw new Error('Cenario do benchmark invalido.')
  const failures = []
  const expected = scenario.expected
  const limits = scenario.limits
  const resultMetrics = result.metrics

  for (const [key, value] of Object.entries(expected)) {
    if (resultMetrics[key] !== value) {
      failures.push(`${key}: esperado ${value}, recebido ${resultMetrics[key]}`)
    }
  }
  for (const [key, max] of Object.entries(limits.maxMetrics)) {
    if (resultMetrics[key] > max) {
      failures.push(`${key}: limite ${max}, recebido ${resultMetrics[key]}`)
    }
  }
  if (result.timing.wallMs > limits.maxWallMs) {
    failures.push(`wallMs: limite ${limits.maxWallMs}, recebido ${result.timing.wallMs}`)
  }
  if (result.timing.heapDeltaBytes > limits.maxHeapDeltaBytes) {
    failures.push(`heapDeltaBytes: limite ${limits.maxHeapDeltaBytes}, recebido ${result.timing.heapDeltaBytes}`)
  }
  if (failures.length > 0) {
    throw new Error(`Cenario ${scenario.id} falhou: ${failures.join('; ')}`)
  }
}
