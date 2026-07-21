export const ACADEMIC_REPORT_DATABASE_PAGE_SIZE = 1000
export const ACADEMIC_REPORT_DATABASE_BATCH_SIZE = 100

export interface AcademicReportPage<T> {
  data: T[] | null
  error: unknown | null
}

export interface AcademicReportPageRange {
  from: number
  page: number
  to: number
}

export async function collectAcademicReportPages<T>(
  fetchPage: (range: AcademicReportPageRange) => Promise<AcademicReportPage<T>>,
  pageSize = ACADEMIC_REPORT_DATABASE_PAGE_SIZE,
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

export function chunkUniqueAcademicReportValues<T>(
  values: T[],
  batchSize = ACADEMIC_REPORT_DATABASE_BATCH_SIZE,
): T[][] {
  const uniqueValues = [...new Set(values)]
  const chunks: T[][] = []
  for (let index = 0; index < uniqueValues.length; index += batchSize) {
    chunks.push(uniqueValues.slice(index, index + batchSize))
  }
  return chunks
}
