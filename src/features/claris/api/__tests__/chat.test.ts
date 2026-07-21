import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchClarisAvailability,
  invokeClarisChat,
} from '@/features/claris/api/chat';
import { CLARIS_CONFIGURED_STORAGE_KEY } from '@/lib/claris-settings';

const invokeEdgeFunctionMock = vi.fn();

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunctionMock(...args),
}));

describe('Claris chat API client', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
    localStorage.clear();
  });

  it('reads only the public availability status from the backend', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({ contractVersion: 1, status: 'ready' });

    await expect(fetchClarisAvailability()).resolves.toBe('ready');
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('claris-chat', {
      body: { operation: 'get_availability' },
    });
    expect(localStorage.getItem(CLARIS_CONFIGURED_STORAGE_KEY)).toBe('true');
  });

  it('sends message intent without browser Moodle credentials', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      contractVersion: 1,
      reply: 'Resposta',
      richBlocks: [],
      uiActions: [],
    });

    await invokeClarisChat({
      message: 'Confirmar?',
      history: [{ role: 'assistant', content: 'Previa' }],
      action: { kind: 'quick_reply', value: 'Confirmo', jobId: 'job-1' },
    });

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('claris-chat', {
      body: {
        operation: 'send_message',
        message: 'Confirmar?',
        history: [{ role: 'assistant', content: 'Previa' }],
        action: { kind: 'quick_reply', value: 'Confirmo', jobId: 'job-1' },
      },
      timeoutMs: 125_000,
    });
  });

  it('validates camelCase UI actions and rich blocks', async () => {
    const response = {
      contractVersion: 1,
      reply: 'Previa pronta',
      uiActions: [{
        id: 'confirm-1',
        jobId: 'job-1',
        kind: 'quick_reply',
        label: 'Confirmar',
        value: 'Confirmo',
      }],
      richBlocks: [{
        type: 'data_table',
        tool: 'get_students',
        title: 'Alunos',
        emptyMessage: 'Nenhum aluno',
        columns: [{ key: 'name', label: 'Nome' }],
        rows: [{ name: 'Ana' }],
      }],
    };
    invokeEdgeFunctionMock.mockResolvedValueOnce(response);

    await expect(invokeClarisChat({ message: 'Oi', history: [] })).resolves.toEqual(response);
  });

  it('falls back safely on availability failure and rejects malformed chat DTOs', async () => {
    invokeEdgeFunctionMock
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ contractVersion: 1, reply: 'sem colecoes' });

    await expect(fetchClarisAvailability()).resolves.toBe('not_configured');
    expect(localStorage.getItem(CLARIS_CONFIGURED_STORAGE_KEY)).toBe('false');
    await expect(invokeClarisChat({ message: 'Oi', history: [] })).rejects.toThrow('resposta invalida');
  });
});
