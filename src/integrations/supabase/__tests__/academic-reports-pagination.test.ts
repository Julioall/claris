import { describe, expect, it, vi } from 'vitest';

import {
  chunkUniqueAcademicReportValues,
  collectAcademicReportPages,
} from '../../../../supabase/functions/academic-reports/pagination.ts';

describe('academic report database pagination', () => {
  it('collects every page without silently truncating at the database row limit', async () => {
    const fetchPage = vi.fn(async ({ page }: { page: number }) => ({
      data: page === 0 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }],
      error: null,
    }));

    await expect(collectAcademicReportPages(fetchPage, 2)).resolves.toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, { from: 0, page: 0, to: 1 });
    expect(fetchPage).toHaveBeenNthCalledWith(2, { from: 2, page: 1, to: 3 });
  });

  it('deduplicates and batches course filters', () => {
    expect(chunkUniqueAcademicReportValues(['a', 'b', 'a', 'c'], 2)).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
  });
});
