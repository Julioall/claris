import { describe, expect, it } from 'vitest';
import { resolveConversationName } from '../../../supabase/functions/_shared/whatsapp/normalization.ts';

describe('resolveConversationName', () => {
  it('ignores self labels from the last outgoing message when contact data exists', () => {
    expect(
      resolveConversationName(
        {
          pushName: 'Você',
          lastMessage: { pushName: 'Você' },
          contact: { pushName: 'Julio Alves' },
        },
        '5562999990000@s.whatsapp.net',
      ),
    ).toBe('Julio Alves');
  });

  it('falls back to a formatted phone when the available labels are only numeric', () => {
    expect(
      resolveConversationName(
        {
          pushName: '5562999990000',
          lastMessage: { pushName: '5562999990000' },
        },
        '5562999990000@s.whatsapp.net',
      ),
    ).toBe('+5562999990000');
  });

  it('keeps the explicit chat name for groups', () => {
    expect(
      resolveConversationName(
        {
          name: 'Turma Aprendizagem 2026',
          subject: 'Turma Aprendizagem 2026',
          lastMessage: { pushName: 'Você' },
        },
        '120363390122612494@g.us',
      ),
    ).toBe('Turma Aprendizagem 2026');
  });
});
