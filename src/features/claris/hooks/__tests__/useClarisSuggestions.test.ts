import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClarisSuggestion } from '@/features/claris/api/contracts/claris-suggestions.contract';
import { useClarisSuggestions } from '@/features/claris/hooks/useClarisSuggestions';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  dismiss: vi.fn(),
  fetch: vi.fn(),
  generate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock('@/features/claris/api/suggestions', () => ({
  acceptClarisSuggestion: (...args: unknown[]) => mocks.accept(...args),
  dismissClarisSuggestion: (...args: unknown[]) => mocks.dismiss(...args),
  fetchPendingClarisSuggestions: (...args: unknown[]) => mocks.fetch(...args),
  generateClarisSuggestions: (...args: unknown[]) => mocks.generate(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function buildSuggestion(id = '11111111-1111-4111-8111-111111111111'): ClarisSuggestion {
  return {
    actionType: 'create_task',
    analysis: 'Risco elevado',
    body: 'Sem contato recente.',
    entityId: 'student-1',
    entityName: 'Ana Silva',
    entityType: 'student',
    expectedImpact: 'Melhoria no engajamento',
    expiresAt: null,
    id,
    priority: 'high',
    reason: '30 dias sem contato',
    status: 'pending',
    suggestedAt: '2026-07-21T12:00:00.000Z',
    title: 'Retomar contato',
    triggerEngine: 'communication',
    type: 'interrupted_contact',
  };
}

describe('useClarisSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.useAuth.mockReturnValue({ user: { id: 'user-1' } });
    mocks.fetch.mockResolvedValue([]);
    mocks.generate.mockResolvedValue({
      contractVersion: 1,
      details: {
        academic: 0,
        agenda: 0,
        communication: 0,
        operational: 0,
        platformUsage: 0,
        tasks: 0,
      },
      enginesRun: 6,
      suggestionsCreated: 0,
    });
  });

  it('does not query suggestions without an authenticated user', async () => {
    mocks.useAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useClarisSuggestions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.suggestions).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('loads pending DTOs through the typed API client', async () => {
    const suggestion = buildSuggestion();
    mocks.fetch.mockResolvedValue([suggestion]);
    const { result } = renderHook(() => useClarisSuggestions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.suggestions).toEqual([suggestion]));
    expect(mocks.fetch).toHaveBeenCalledWith(10);
  });

  it('accepts a suggestion by id and uses the backend effect', async () => {
    const suggestion = buildSuggestion();
    mocks.fetch.mockResolvedValue([suggestion]);
    mocks.accept.mockResolvedValue({
      actionType: 'create_task',
      contractVersion: 1,
      createdEntityId: '22222222-2222-4222-8222-222222222222',
      effect: 'task_created',
      status: 'accepted',
      suggestionId: suggestion.id,
    });
    const { result } = renderHook(() => useClarisSuggestions(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));

    act(() => result.current.acceptSuggestion(suggestion));

    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith(suggestion.id));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Tarefa criada a partir da sugestão');
  });

  it('dismisses through one backend command without a client-side cooldown write', async () => {
    const suggestion = buildSuggestion();
    mocks.fetch.mockResolvedValue([suggestion]);
    mocks.dismiss.mockResolvedValue({
      actionType: 'create_task',
      contractVersion: 1,
      createdEntityId: null,
      effect: 'none',
      status: 'dismissed',
      suggestionId: suggestion.id,
    });
    const { result } = renderHook(() => useClarisSuggestions(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));

    act(() => result.current.dismissSuggestion(suggestion.id));

    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledWith(suggestion.id));
  });

  it('generates through the typed HTTP client and records the successful run', async () => {
    const { result } = renderHook(() => useClarisSuggestions(), { wrapper: createWrapper() });

    await act(async () => result.current.triggerProactiveGeneration());

    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(Number(sessionStorage.getItem('claris_proactive_last_run'))).toBeGreaterThan(0);
  });

  it('rate-limits automatic generation in session storage', async () => {
    sessionStorage.setItem('claris_proactive_last_run', String(Date.now() - 60_000));
    const { result } = renderHook(() => useClarisSuggestions(), { wrapper: createWrapper() });

    await act(async () => result.current.triggerProactiveGeneration());

    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('does not record a failed best-effort generation', async () => {
    mocks.generate.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useClarisSuggestions(), { wrapper: createWrapper() });

    await act(async () => result.current.forceGenerate());

    expect(sessionStorage.getItem('claris_proactive_last_run')).toBeNull();
    expect(result.current.isGenerating).toBe(false);
  });
});
