import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCalendarEvents } from '@/features/agenda/hooks/useCalendarEvents';
import { createQueryClientWrapper } from '@/test/query-client';

const useAuthMock = vi.fn();
const listCalendarEventsMock = vi.fn();
const createCalendarEventMock = vi.fn();
const updateCalendarEventMock = vi.fn();
const deleteCalendarEventMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/agenda/api/calendar.repository', () => ({
  calendarRepository: {
    listEvents: (...args: unknown[]) => listCalendarEventsMock(...args),
    createEvent: (...args: unknown[]) => createCalendarEventMock(...args),
    updateEvent: (...args: unknown[]) => updateCalendarEventMock(...args),
    deleteEvent: (...args: unknown[]) => deleteCalendarEventMock(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

const baseEvents = [
  {
    id: 'event-1',
    title: 'WebAula',
    start_at: '2026-03-20T09:00:00-03:00',
    end_at: '2026-03-20T10:00:00-03:00',
    type: 'webclass',
    owner: 'user-1',
    external_source: 'manual',
    created_at: '2026-03-20T08:00:00.000Z',
    updated_at: '2026-03-20T08:00:00.000Z',
  },
];

describe('useCalendarEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
    listCalendarEventsMock.mockResolvedValue(baseEvents);
    createCalendarEventMock.mockResolvedValue(baseEvents[0]);
    updateCalendarEventMock.mockResolvedValue(baseEvents[0]);
    deleteCalendarEventMock.mockResolvedValue(undefined);
  });

  it('loads events for the authenticated user', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCalendarEvents(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.events).toEqual(baseEvents);
    expect(listCalendarEventsMock).toHaveBeenCalledWith(undefined, undefined, 'user-1');
  });

  it('creates an event with the current owner and invalidates the query', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCalendarEvents(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      result.current.createEvent({
        title: 'Novo evento',
        start_at: '2026-03-21T09:00',
        type: 'manual',
      });
    });

    await waitFor(() => {
      expect(createCalendarEventMock).toHaveBeenCalledWith({
        title: 'Novo evento',
        start_at: '2026-03-21T09:00',
        type: 'manual',
        owner: 'user-1',
      });
    });
    await waitFor(() => {
      expect(listCalendarEventsMock).toHaveBeenCalledTimes(2);
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Evento criado com sucesso');
  });

  it('updates and deletes events through the repository', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCalendarEvents(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      result.current.updateEvent({ id: 'event-1', input: { title: 'Atualizado' } });
      result.current.deleteEvent('event-1');
    });

    await waitFor(() => {
      expect(updateCalendarEventMock).toHaveBeenCalledWith('event-1', { title: 'Atualizado' });
    });
    await waitFor(() => {
      expect(deleteCalendarEventMock).toHaveBeenCalledWith('event-1');
    });
  });

  it('does not fetch events when there is no authenticated user', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useCalendarEvents(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.events).toEqual([]);
    expect(listCalendarEventsMock).not.toHaveBeenCalled();
  });
});
