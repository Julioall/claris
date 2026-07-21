import { describe, expect, it, vi } from 'vitest';

import {
  chunkUniqueCoursePanelValues,
  collectCoursePanelPages,
} from '../../../../supabase/functions/course-panel/pagination.ts';

describe('course-panel repository pagination', () => {
  it('continues after the PostgREST 1000-row boundary', async () => {
    const source = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1 }));
    const fetchPage = vi.fn(async ({ from, to }: { from: number; to: number }) => ({
      data: source.slice(from, to + 1),
      error: null,
    }));

    const rows = await collectCoursePanelPages(fetchPage);

    expect(rows).toHaveLength(1001);
    expect(rows.at(-1)).toEqual({ id: 1001 });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, { from: 0, page: 0, to: 999 });
    expect(fetchPage).toHaveBeenNthCalledWith(2, { from: 1000, page: 1, to: 1999 });
  });

  it('propagates database failures without returning a partial panel', async () => {
    const databaseError = { code: 'database_error' };
    await expect(collectCoursePanelPages(async () => ({
      data: null,
      error: databaseError,
    }))).rejects.toBe(databaseError);
  });

  it('deduplicates ids before bounded in-query batches', () => {
    expect(chunkUniqueCoursePanelValues(['a', 'a', 'b', 'c'], 2)).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
  });
});
