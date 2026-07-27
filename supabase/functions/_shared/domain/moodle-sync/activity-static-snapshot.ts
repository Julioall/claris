export interface ActivityStaticItem {
  dueDate: string | null
  id: string
  name: string
  type: string
}

export interface ActivityStaticSnapshot {
  activities: ActivityStaticItem[]
}

interface RawActivity {
  id: string | number
  name: string
  modname: string
}

interface FallbackSnapshot {
  activities: RawActivity[]
  dueDates: Record<string, string | null>
}

type CallMoodleApi = (
  moodleUrl: string,
  token: string,
  operation: string,
  parameters?: Record<string, unknown>,
) => Promise<unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function readText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function extractActivities(courseContents: unknown[]): RawActivity[] {
  return courseContents.flatMap((section) => (
    isRecord(section) && Array.isArray(section.modules)
      ? records(section.modules)
        .filter((module) => (
          typeof module.modname === 'string'
          && ['quiz', 'assign', 'forum'].includes(module.modname)
          && module.id != null
        ))
        .map((module) => ({
          id: module.id as string | number,
          modname: module.modname as string,
          name: readText(module.name, `Activity ${module.id}`),
        }))
      : []
  ))
}

async function fetchFallback(
  callApi: CallMoodleApi,
  moodleUrl: string,
  token: string,
  courseId: number,
): Promise<FallbackSnapshot> {
  const requests = [
    {
      operation: 'mod_assign_get_assignments',
      read: (data: unknown) => {
        const course = isRecord(data) ? records(data.courses)[0] : undefined
        const assignments = records(course?.assignments)
        return {
          activities: assignments.map((item) => ({
            id: (item.cmid ?? item.coursemodule ?? item.id) as string | number,
            modname: 'assign',
            name: readText(item.name, `Assignment ${item.id ?? ''}`),
          })),
          dueDates: Object.fromEntries(assignments.flatMap((item) => {
            const id = item.cmid ?? item.coursemodule ?? item.id
            return id != null && typeof item.duedate === 'number' && item.duedate > 0
              ? [[String(id), new Date(item.duedate * 1_000).toISOString()]]
              : []
          })),
        }
      },
    },
    {
      operation: 'mod_quiz_get_quizzes_by_courses',
      read: (data: unknown) => {
        const quizzes = records(isRecord(data) ? data.quizzes : null)
        return {
          activities: quizzes.map((item) => ({
            id: (item.coursemodule ?? item.cmid ?? item.id) as string | number,
            modname: 'quiz',
            name: readText(item.name, `Quiz ${item.id ?? ''}`),
          })),
          dueDates: Object.fromEntries(quizzes.flatMap((item) => {
            const id = item.coursemodule ?? item.cmid ?? item.id
            return id != null && typeof item.timeclose === 'number' && item.timeclose > 0
              ? [[String(id), new Date(item.timeclose * 1_000).toISOString()]]
              : []
          })),
        }
      },
    },
    {
      operation: 'mod_forum_get_forums_by_courses',
      read: (data: unknown) => ({
        activities: records(isRecord(data) ? data.forums : null).map((item) => ({
          id: (item.cmid ?? item.coursemodule ?? item.id) as string | number,
          modname: 'forum',
          name: readText(item.name, `Forum ${item.id ?? ''}`),
        })),
        dueDates: {},
      }),
    },
  ]
  const settled = await Promise.allSettled(requests.map(async (request) => (
    request.read(await callApi(
      moodleUrl,
      token,
      request.operation,
      { 'courseids[0]': courseId },
    ))
  )))
  const successful = settled.filter(
    (result): result is PromiseFulfilledResult<FallbackSnapshot> => result.status === 'fulfilled',
  )
  if (successful.length === 0) {
    throw new Error('No Moodle activity metadata endpoint was available for this course.')
  }

  const unique = new Map<string, RawActivity>()
  successful.flatMap((result) => result.value.activities).forEach((activity) => {
    if (activity.id == null) return
    unique.set(String(activity.id), {
      ...activity,
      name: typeof activity.name === 'string'
        ? activity.name
      : `Activity ${activity.id}`,
    })
  })
  return {
    activities: [...unique.values()],
    dueDates: Object.assign({}, ...successful.map((result) => result.value.dueDates)),
  }
}

async function fetchDueDates(
  callApi: CallMoodleApi,
  moodleUrl: string,
  token: string,
  courseId: number,
  activities: RawActivity[],
): Promise<Record<string, string | null>> {
  const dueDates: Record<string, string | null> = {}
  const requests: Promise<void>[] = []

  if (activities.some((activity) => activity.modname === 'assign')) {
    requests.push(callApi(
      moodleUrl,
      token,
      'mod_assign_get_assignments',
      { 'courseids[0]': courseId },
    ).then((data) => {
      const course = isRecord(data) ? records(data.courses)[0] : undefined
      for (const item of records(course?.assignments)) {
        if (item.cmid && typeof item.duedate === 'number' && item.duedate > 0) {
          dueDates[String(item.cmid)] = new Date(item.duedate * 1_000).toISOString()
        }
      }
    }).catch(() => undefined))
  }

  if (activities.some((activity) => activity.modname === 'quiz')) {
    requests.push(callApi(
      moodleUrl,
      token,
      'mod_quiz_get_quizzes_by_courses',
      { 'courseids[0]': courseId },
    ).then((data) => {
      for (const item of records(isRecord(data) ? data.quizzes : null)) {
        if (item.coursemodule && typeof item.timeclose === 'number' && item.timeclose > 0) {
          dueDates[String(item.coursemodule)] = new Date(item.timeclose * 1_000).toISOString()
        }
      }
    }).catch(() => undefined))
  }

  await Promise.all(requests)
  return dueDates
}

export async function loadActivityStaticSnapshot(
  callApi: CallMoodleApi,
  moodleUrl: string,
  token: string,
  courseId: number,
): Promise<ActivityStaticSnapshot> {
  let activities: RawActivity[]
  let fallbackDueDates: Record<string, string | null> | null = null
  try {
    const contents = await callApi(
      moodleUrl,
      token,
      'core_course_get_contents',
      { courseid: courseId },
    )
    activities = extractActivities(Array.isArray(contents) ? contents : [])
  } catch {
    const fallback = await fetchFallback(callApi, moodleUrl, token, courseId)
    activities = fallback.activities
    fallbackDueDates = fallback.dueDates
  }

  const dueDates = fallbackDueDates
    ?? await fetchDueDates(callApi, moodleUrl, token, courseId, activities)
  return {
    activities: activities.map((activity) => ({
      dueDate: dueDates[String(activity.id)] ?? null,
      id: String(activity.id),
      name: activity.name,
      type: activity.modname,
    })),
  }
}
