export const COURSE_PANEL_DATABASE_PAGE_SIZE = 1000
export const COURSE_PANEL_DATABASE_BATCH_SIZE = 100

export interface CoursePanelPage<T> {
  data: T[] | null
  error: unknown | null
}

export interface CoursePanelPageRange {
  from: number
  page: number
  to: number
}

export async function collectCoursePanelPages<T>(
  fetchPage: (range: CoursePanelPageRange) => Promise<CoursePanelPage<T>>,
  pageSize = COURSE_PANEL_DATABASE_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = []

  for (let page = 0; ; page += 1) {
    const from = page * pageSize
    const { data, error } = await fetchPage({
      from,
      page,
      to: from + pageSize - 1,
    })

    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return rows
  }
}

export function chunkUniqueCoursePanelValues<T>(
  values: T[],
  batchSize = COURSE_PANEL_DATABASE_BATCH_SIZE,
): T[][] {
  const uniqueValues = [...new Set(values)]
  const chunks: T[][] = []

  for (let index = 0; index < uniqueValues.length; index += batchSize) {
    chunks.push(uniqueValues.slice(index, index + batchSize))
  }

  return chunks
}
