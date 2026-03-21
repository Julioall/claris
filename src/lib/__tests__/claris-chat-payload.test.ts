import { describe, expect, it } from 'vitest';
import { optimizeChatTextForLlm, parseClarisChatPayload } from '../../../supabase/functions/claris-chat/payload.ts';

describe('claris chat payload optimization', () => {
  it('minifies JSON payloads before sending them to the model', () => {
    const input = [
      '```json',
      '[',
      '  {',
      '    "titulo": "Evento",',
      '    "tags": ["a", "b"]',
      '  }',
      ']',
      '```',
    ].join('\n');

    expect(optimizeChatTextForLlm(input)).toBe('[{"titulo":"Evento","tags":["a","b"]}]');
  });

  it('removes decorative markdown formatting while preserving content', () => {
    const input = [
      '### Agenda',
      '',
      '**Evento importante**',
      '',
      '* item   com   espacos',
      '',
      '[Teams](https://example.com/reuniao)',
    ].join('\n');

    expect(optimizeChatTextForLlm(input)).toBe([
      'Agenda',
      '',
      'Evento importante',
      '',
      '- item com espacos',
      '',
      'Teams: https://example.com/reuniao',
    ].join('\n'));
  });

  it('normalizes current message and history content through the parser', () => {
    const payload = parseClarisChatPayload({
      message: '```json\n{\n  "tipo": "evento"\n}\n```',
      history: [
        { role: 'assistant', content: '### Resumo\n\n**Tudo certo**' },
      ],
    });

    expect(payload.message).toBe('{"tipo":"evento"}');
    expect(payload.history).toEqual([
      { role: 'assistant', content: 'Resumo\n\nTudo certo' },
    ]);
  });
});
