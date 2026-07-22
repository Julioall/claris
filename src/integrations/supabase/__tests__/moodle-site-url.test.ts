import { describe, expect, it } from 'vitest';

import { normalizeApprovedMoodleBaseUrl } from '../../../../supabase/functions/_shared/moodle/site-url.ts';

describe('approved Moodle site URL boundary', () => {
  it.each([
    ['https://ead.fieg.com.br', 'https://ead.fieg.com.br'],
    ['https://EAD.SENAI.BR/', 'https://ead.senai.br'],
    ['https://ead.senai.br:443', 'https://ead.senai.br'],
  ])('normalizes approved host-only HTTPS URLs', (input, expected) => {
    expect(normalizeApprovedMoodleBaseUrl(input)).toBe(expected);
  });

  it.each([
    'http://ead.fieg.com.br',
    'https://localhost',
    'https://moodle.local',
    'https://127.0.0.1',
    'https://169.254.169.254',
    'https://[::1]',
    'https://user:secret@ead.fieg.com.br',
    'https://ead.fieg.com.br:8443',
    'https://ead.fieg.com.br/moodle',
    'https://ead.fieg.com.br?redirect=evil',
  ])('rejects unsafe URL %s', (input) => {
    expect(() => normalizeApprovedMoodleBaseUrl(input)).toThrow('not allowed');
  });
});
