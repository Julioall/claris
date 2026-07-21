import { describe, expect, it } from 'vitest';

import { parseClarisChatPayload } from '../../../../supabase/functions/claris-chat/payload.ts';
import {
  getClarisAvailabilityStatus,
  shouldResolveMoodleAccess,
  toClarisAvailabilityDto,
  toClarisChatResponseDto,
} from '../../../../supabase/functions/claris-chat/rules.ts';

function v1Request() {
  return new Request('http://localhost/claris-chat', {
    headers: { 'x-claris-api-version': '1' },
    method: 'POST',
  });
}

const readySettings = {
  apiKey: 'server-secret',
  baseUrl: 'https://api.example.com/v1',
  configured: true,
  customInstructions: '',
  model: 'model-1',
  provider: 'custom',
};

describe('claris-chat V1 contract', () => {
  it('accepts only chat intent and normalizes the bounded history', () => {
    expect(parseClarisChatPayload({
      operation: 'send_message',
      message: '  Oi  ',
      history: [{ role: 'assistant', content: '**Resumo**' }],
    }, v1Request())).toEqual({
      operation: 'send_message',
      requestVersion: 'v1',
      message: 'Oi',
      history: [{ role: 'assistant', content: 'Resumo' }],
    });
  });

  it.each([
    { operation: 'get_availability', userId: 'spoof' },
    { operation: 'send_message', message: 'Oi', history: [], moodleToken: 'browser-token' },
    { operation: 'send_message', message: 'Oi', history: [], moodleUrl: 'https://moodle.example.com' },
    { operation: 'send_message', message: 'Oi', history: [{ role: 'user', content: 'Oi', userId: 'spoof' }] },
    { operation: 'send_message', message: 'Oi', history: [], action: { kind: 'quick_reply', value: 'Ok', job_id: 'legacy' } },
  ])('rejects credentials, identity and non-contract fields: %o', (payload) => {
    expect(() => parseClarisChatPayload(payload, v1Request())).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });

  it('exposes only availability state and never provider settings', () => {
    expect(getClarisAvailabilityStatus(readySettings)).toBe('ready');
    expect(getClarisAvailabilityStatus({ ...readySettings, apiKey: '' })).toBe('invalid');
    expect(getClarisAvailabilityStatus({ ...readySettings, configured: false })).toBe('not_configured');

    const dto = toClarisAvailabilityDto(readySettings);
    expect(dto).toEqual({ contractVersion: 1, status: 'ready' });
    expect(JSON.stringify(dto)).not.toContain('server-secret');
    expect(JSON.stringify(dto)).not.toContain('provider');
  });

  it('maps backend tool output to a stable camelCase DTO', () => {
    const dto = toClarisChatResponseDto({
      reply: 'Previa',
      uiActions: [{
        id: 'confirm-1',
        job_id: 'job-1',
        kind: 'quick_reply',
        label: 'Confirmar',
        value: 'Confirmo',
      }],
      richBlocks: [{
        type: 'data_table',
        tool: 'students',
        title: 'Alunos',
        empty_message: 'Nenhum aluno',
        columns: [{ key: 'name', label: 'Nome' }],
        rows: [{ name: 'Ana' }],
      }],
    });

    expect(dto).toMatchObject({
      contractVersion: 1,
      uiActions: [{ jobId: 'job-1' }],
      richBlocks: [{ emptyMessage: 'Nenhum aluno' }],
    });
    expect(JSON.stringify(dto)).not.toContain('job_id');
    expect(JSON.stringify(dto)).not.toContain('empty_message');
  });

  it('requests server Moodle access only for an explicit send confirmation', () => {
    const base = {
      operation: 'send_message' as const,
      requestVersion: 'v1' as const,
      history: [],
    };
    expect(shouldResolveMoodleAccess({ ...base, message: 'Enviar mensagem' })).toBe(false);
    expect(shouldResolveMoodleAccess({
      ...base,
      message: 'Confirmo o envio do job job-1.',
    })).toBe(true);
  });
});
