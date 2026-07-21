import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMessageTemplate,
  listMessageTemplatesForUser,
  setMessageTemplateFavorite,
} from '@/features/messages/api/message-templates.repository';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@/integrations/http/edge-function-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/integrations/http/edge-function-client')>();
  return { ...original, invokeEdgeFunction: (...args: unknown[]) => invokeMock(...args) };
});

const metadata = { contractVersion: 1, generatedAt: '2026-07-21T10:00:00.000Z' };
const template = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Aviso',
  content: 'Conteudo',
  category: 'geral',
  isFavorite: true,
  isDefault: false,
  defaultKey: null,
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T11:00:00.000Z',
};

describe('message templates repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists templates through the V1 API and maps the view model', async () => {
    invokeMock.mockResolvedValueOnce({ items: [template], metadata });

    await expect(listMessageTemplatesForUser()).resolves.toEqual([expect.objectContaining({
      id: template.id,
      is_favorite: true,
      created_at: template.createdAt,
    })]);
    expect(invokeMock).toHaveBeenCalledWith('message-templates', {
      auth: 'required',
      body: { action: 'list_templates' },
      timeoutMs: 15_000,
    });
  });

  it('does not send actor identity in commands', async () => {
    invokeMock.mockResolvedValue({ template, metadata });
    await createMessageTemplate({ category: 'geral', content: 'Conteudo', title: 'Aviso' });
    await setMessageTemplateFavorite(template.id, true);

    expect(invokeMock.mock.calls.map((call) => call[1].body)).toEqual([
      {
        action: 'create_template',
        input: { category: 'geral', content: 'Conteudo', title: 'Aviso' },
      },
      { action: 'set_favorite', isFavorite: true, templateId: template.id },
    ]);
    expect(JSON.stringify(invokeMock.mock.calls)).not.toMatch(/userId|user_id/);
  });
});
