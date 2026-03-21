import { describe, expect, it } from 'vitest';
import { buildRequestMessagesForModel, summarizeToolResultForModel, type LoopChatMessage } from '../../../supabase/functions/_shared/claris/loop-optimization.ts';

describe('claris loop optimization helpers', () => {
  it('summarizes older conversation messages and keeps recent context raw', () => {
    const messages: LoopChatMessage[] = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'mensagem 1' },
      { role: 'assistant', content: 'resposta 1' },
      { role: 'user', content: 'mensagem 2' },
      { role: 'assistant', content: 'resposta 2' },
      { role: 'user', content: 'mensagem 3' },
      { role: 'assistant', content: 'resposta 3' },
      { role: 'user', content: 'mensagem 4' },
      { role: 'assistant', content: 'resposta 4' },
      { role: 'user', content: 'mensagem final' },
    ];

    const requestMessages = buildRequestMessagesForModel(messages);

    expect(requestMessages[0]).toEqual({ role: 'system', content: 'system prompt' });
    expect(requestMessages.some((message) => message.role === 'system' && message.content?.startsWith('Resumo curto da conversa anterior:'))).toBe(true);
    expect(requestMessages.at(-1)).toEqual({ role: 'user', content: 'mensagem final' });
  });

  it('compacts tool results before they are replayed to the model', () => {
    const summary = summarizeToolResultForModel('batch_create_events', {
      success: true,
      count: 6,
      events: [
        { id: '1', title: 'Evento 1', start_at: '2026-03-25T14:00:00-03:00' },
        { id: '2', title: 'Evento 2', start_at: '2026-03-25T15:00:00-03:00' },
        { id: '3', title: 'Evento 3', start_at: '2026-03-25T16:00:00-03:00' },
        { id: '4', title: 'Evento 4', start_at: '2026-03-25T17:00:00-03:00' },
        { id: '5', title: 'Evento 5', start_at: '2026-03-25T18:00:00-03:00' },
      ],
      message_preview: 'x'.repeat(600),
    });

    const parsed = JSON.parse(summary) as {
      tool: string;
      result: {
        success: boolean;
        count: number;
        events: { count: number; items: Array<{ title: string }>; omitted_count: number };
        message_preview: string;
      };
    };

    expect(parsed.tool).toBe('batch_create_events');
    expect(parsed.result.success).toBe(true);
    expect(parsed.result.events.count).toBe(5);
    expect(parsed.result.events.omitted_count).toBe(1);
    expect(parsed.result.message_preview.length).toBeLessThan(260);
  });
});
