export const STUDENTS_DATABASE_PAGE_SIZE = 500
export const STUDENTS_DATABASE_BATCH_SIZE = 200

interface PageResult<T> {
  data: T[] | null
  error: unknown
}

export async function collectStudentsPages<T>(
  loadPage: (range: { from: number; to: number }) => Promise<PageResult<T>>,
  pageSize = STUDENTS_DATABASE_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage({ from, to: from + pageSize - 1 })
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

export function chunkUniqueStudentsValues(
  values: string[],
  batchSize = STUDENTS_DATABASE_BATCH_SIZE,
): string[][] {
  const uniqueValues = [...new Set(values.filter(Boolean))]
  const batches: string[][] = []
  for (let offset = 0; offset < uniqueValues.length; offset += batchSize) {
    batches.push(uniqueValues.slice(offset, offset + batchSize))
  }
  return batches
}
