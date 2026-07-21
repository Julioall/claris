import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupData } from '@/features/settings/api/cleanup';
import { CLEANUP_OPTIONS } from '@/features/settings/lib/cleanup-options';

const invokeEdgeFunctionMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: invokeEdgeFunctionMock,
}));

describe('settings cleanup api', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
    invokeEdgeFunctionMock.mockResolvedValue({
      contractVersion: 1,
      success: true,
      operationId: '00000000-0000-4000-8000-000000000099',
      completedSelectionIds: ['academic_activities'],
      errors: [],
    });
  });

  it('keeps physical table names out of frontend cleanup options', () => {
    expect(CLEANUP_OPTIONS).toContainEqual(expect.objectContaining({ id: 'course_catalog' }));
    expect(CLEANUP_OPTIONS.every((option) => !('tables' in option))).toBe(true);
  });

  it('sends a versioned destructive intent only after explicit confirmation', async () => {
    await cleanupData({
      confirmed: true,
      mode: 'selected_cleanup',
      selectionIds: ['academic_activities'],
    });

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('data-cleanup', {
      body: {
        action: 'execute_cleanup',
        confirmation: 'CONFIRM_OPERATIONAL_DATA_CLEANUP_V1',
        mode: 'selected_cleanup',
        selectionIds: ['academic_activities'],
      },
    });
  });

  it('does not send a selection field for full cleanup', async () => {
    await cleanupData({ confirmed: true, mode: 'full_cleanup' });

    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).toEqual({
      action: 'execute_cleanup',
      confirmation: 'CONFIRM_OPERATIONAL_DATA_CLEANUP_V1',
      mode: 'full_cleanup',
    });
  });

  it('rejects missing runtime confirmation before invoking the backend', async () => {
    await expect(cleanupData({
      confirmed: false,
      mode: 'full_cleanup',
    } as never)).rejects.toThrow(/confirmação explícita/i);
    expect(invokeEdgeFunctionMock).not.toHaveBeenCalled();
  });
});
