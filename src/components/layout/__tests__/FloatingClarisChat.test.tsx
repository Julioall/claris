import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FloatingClarisChat } from '@/components/layout/FloatingClarisChat';
import { CLARIS_CONFIGURED_STORAGE_KEY } from '@/lib/claris-settings';

const invokeMock = vi.fn();
const fromMock = vi.fn();
const WIDGET_OPEN_STORAGE_KEY = 'claris_chat_widget_open';
let conversationsStore: Array<{
  id: string;
  user_id: string;
  title: string;
  messages: Array<{ role: 'assistant' | 'user'; content: string }>;
  last_context_route: string | null;
  updated_at: string;
  created_at: string;
}> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    moodleSession: {
      moodleUrl: 'https://moodle.example.com',
      moodleToken: 'token-123',
    },
  }),
}));

function setClarisConfigured(value: boolean) {
  localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, value ? 'true' : 'false');
}

const HISTORY_STORAGE_KEY = 'claris_chat_history:user-1';

beforeEach(() => {
  invokeMock.mockReset();
  fromMock.mockReset();
  localStorage.clear();
  conversationsStore = [];

  fromMock.mockImplementation((table: string) => {
    if (table !== 'claris_conversations') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({
              data: [...conversationsStore].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
              error: null,
            }),
          }),
        }),
      }),
      insert: (payload: { user_id: string; title?: string; messages?: Array<{ role: 'assistant' | 'user'; content: string }>; last_context_route?: string }) => ({
        select: () => ({
          single: async () => {
            const now = new Date().toISOString();
            const row = {
              id: `conv-${Date.now()}-${Math.random()}`,
              user_id: payload.user_id,
              title: payload.title ?? 'Nova conversa',
              messages: payload.messages ?? [],
              last_context_route: payload.last_context_route ?? null,
              updated_at: now,
              created_at: now,
            };
            conversationsStore = [row, ...conversationsStore];
            return { data: row, error: null };
          },
        }),
      }),
      update: (payload: { title?: string; messages?: Array<{ role: 'assistant' | 'user'; content: string }>; last_context_route?: string }) => ({
        eq: (_idColumn: string, idValue: string) => ({
          eq: async () => {
            conversationsStore = conversationsStore.map((row) =>
              row.id === idValue
                ? {
                    ...row,
                    title: payload.title ?? row.title,
                    messages: payload.messages ?? row.messages,
                    last_context_route: payload.last_context_route ?? row.last_context_route,
                    updated_at: new Date().toISOString(),
                  }
                : row,
            );
            return { data: null, error: null };
          },
        }),
      }),
      delete: () => ({
        eq: (_idColumn: string, idValue: string) => ({
          eq: async () => {
            conversationsStore = conversationsStore.filter((row) => row.id !== idValue);
            return { data: null, error: null };
          },
        }),
      }),
    };
  });
});

function renderFloatingClarisChat() {
  return render(
    <MemoryRouter>
      <FloatingClarisChat />
    </MemoryRouter>,
  );
}

describe('FloatingClarisChat', () => {
  it('opens and closes the floating chat', async () => {
    invokeMock.mockResolvedValue({ data: { reply: 'ok' }, error: null });
    setClarisConfigured(false);
    const user = userEvent.setup();
    renderFloatingClarisChat();

    const openButton = screen.getByRole('button', { name: /abrir chat da claris ia/i });
    await user.click(openButton);

    expect(screen.getByLabelText(/mensagem para claris ia/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^fechar chat$/i }));

    expect(localStorage.getItem(WIDGET_OPEN_STORAGE_KEY)).toBe('false');

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/digite sua mensagem/i)).not.toBeInTheDocument();
    });
  });

  it('restores the floating chat open state from localStorage', async () => {
    localStorage.setItem(WIDGET_OPEN_STORAGE_KEY, 'true');
    renderFloatingClarisChat();

    expect(screen.getByLabelText(/mensagem para claris ia/i)).toBeInTheDocument();
  });

  it('replies asking for configuration when not configured', async () => {
    invokeMock.mockResolvedValue({ data: { reply: 'ok' }, error: null });
    setClarisConfigured(false);
    const user = userEvent.setup();
    renderFloatingClarisChat();

    await user.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));
    await user.type(screen.getByLabelText(/mensagem para claris ia/i), 'Oi, Claris');
    await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    expect(screen.getByText('Oi, Claris')).toBeInTheDocument();
    expect(screen.getByText(/ainda não estou configurada\. vá em configurações > claris ia/i)).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('calls edge function and renders llm response when configured', async () => {
    invokeMock.mockResolvedValue({ data: { reply: 'Olá! Posso te ajudar com seus alunos hoje.' }, error: null });
    setClarisConfigured(true);
    const user = userEvent.setup();
    renderFloatingClarisChat();

    await user.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));
    await user.type(screen.getByLabelText(/mensagem para claris ia/i), 'Tudo certo?');
    await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('claris-chat', {
        body: {
          message: 'Tudo certo?',
          history: [],
          moodleUrl: 'https://moodle.example.com',
          moodleToken: 'token-123',
          action: undefined,
        },
      });
    });

    expect(screen.getByText(/posso te ajudar com seus alunos hoje/i)).toBeInTheDocument();
  });

  it('shows fallback error message when llm request fails', async () => {
    invokeMock.mockRejectedValue(new Error('network error'));
    setClarisConfigured(true);
    const user = userEvent.setup();
    renderFloatingClarisChat();

    await user.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));
    await user.type(screen.getByLabelText(/mensagem para claris ia/i), 'Teste erro');
    await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    await waitFor(() => {
      expect(screen.getByText(/não consegui me conectar ao modelo agora/i)).toBeInTheDocument();
    });
  });

  it('restores chat history when reopening component', async () => {
    setClarisConfigured(true);
    conversationsStore = [{
      id: 'conv-1',
      user_id: 'user-1',
      title: 'Conversa antiga',
      messages: [
        { role: 'user', content: 'Mensagem antiga' },
        { role: 'assistant', content: 'Resposta antiga' },
      ],
      last_context_route: '/alunos',
      updated_at: '2026-03-15T10:00:00.000Z',
      created_at: '2026-03-15T10:00:00.000Z',
    }];

    const user = userEvent.setup();
    renderFloatingClarisChat();

    await user.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));

    expect(screen.getByText('Mensagem antiga')).toBeInTheDocument();
    expect(screen.getByText('Resposta antiga')).toBeInTheDocument();
  });

  it('clears history with /limpar command without calling llm', async () => {
    setClarisConfigured(true);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([
      { role: 'user', content: 'Mensagem antiga' },
    ]));

    const user = userEvent.setup();
    renderFloatingClarisChat();

    await user.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));
    await user.type(screen.getByLabelText(/mensagem para claris ia/i), '/limpar');
    await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    expect(invokeMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Mensagem antiga')).not.toBeInTheDocument();
    expect(screen.getByText(/histórico da conversa limpo com sucesso/i)).toBeInTheDocument();
  });

  it('renders quick action buttons and sends selected action payload', async () => {
    invokeMock
      .mockResolvedValueOnce({
        data: {
          reply: 'Prévia pronta. Deseja confirmar o envio?',
          uiActions: [
            {
              id: 'confirm-send-job-123',
              label: 'Confirmar envio',
              value: 'Confirmo o envio do job job-123.',
              kind: 'quick_reply',
              job_id: 'job-123',
            },
          ],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          reply: 'Envio confirmado e processado.',
          uiActions: [],
        },
        error: null,
      });

    setClarisConfigured(true);
    const user = userEvent.setup();
    renderFloatingClarisChat();

    await user.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));
    await user.type(screen.getByLabelText(/mensagem para claris ia/i), 'Enviar lembrete para Steffany');
    await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    const quickActionButton = await screen.findByRole('button', { name: /confirmar envio/i });
    await user.click(quickActionButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenNthCalledWith(2, 'claris-chat', {
        body: {
          message: 'Confirmo o envio do job job-123.',
          history: [
            { role: 'user', content: 'Enviar lembrete para Steffany' },
            { role: 'assistant', content: 'Prévia pronta. Deseja confirmar o envio?' },
          ],
          moodleUrl: 'https://moodle.example.com',
          moodleToken: 'token-123',
          action: {
            kind: 'quick_reply',
            value: 'Confirmo o envio do job job-123.',
            jobId: 'job-123',
          },
        },
      });
    });

    expect(screen.getByText(/envio confirmado e processado/i)).toBeInTheDocument();
  });

  it('renders data_table rich block returned by the edge function', async () => {
    invokeMock.mockResolvedValue({
      data: {
        reply: 'Aqui estão as atividades para corrigir:',
        uiActions: [],
        richBlocks: [
          {
            type: 'data_table',
            tool: 'get_activities_to_review',
            title: 'Atividades para Corrigir (2)',
            empty_message: 'Nenhuma atividade.',
            columns: [
              { key: 'aluno', label: 'Aluno' },
              { key: 'curso', label: 'Curso' },
              { key: 'atividade', label: 'Atividade' },
            ],
            rows: [
              { aluno: 'João Silva', curso: 'WD01', atividade: 'Projeto Final' },
              { aluno: 'Maria F.', curso: 'TI02', atividade: 'Hands-on' },
            ],
          },
        ],
      },
      error: null,
    });

    setClarisConfigured(true);
    const user = userEvent.setup();
    renderFloatingClarisChat();

    await user.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));
    await user.type(screen.getByLabelText(/mensagem para claris ia/i), 'O que tem para corrigir?');
    await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    await waitFor(() => {
      expect(screen.getByText(/atividades para corrigir \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText('João Silva')).toBeInTheDocument();
      expect(screen.getByText('Maria F.')).toBeInTheDocument();
    });
  });

  it('renders stat_cards rich block returned by the edge function', async () => {
    invokeMock.mockResolvedValue({
      data: {
        reply: 'Resumo do sistema:',
        uiActions: [],
        richBlocks: [
          {
            type: 'stat_cards',
            title: 'Resumo do Sistema',
            stats: [
              { label: 'Críticos', value: '5', variant: 'danger' },
              { label: 'Tarefas Abertas', value: '8', variant: 'default' },
            ],
          },
        ],
      },
      error: null,
    });

    setClarisConfigured(true);
    const user = userEvent.setup();
    renderFloatingClarisChat();

    await user.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));
    await user.type(screen.getByLabelText(/mensagem para claris ia/i), 'Faça um resumo');
    await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    await waitFor(() => {
      expect(screen.getByText('Resumo do Sistema')).toBeInTheDocument();
      expect(screen.getByText('Críticos')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Tarefas Abertas')).toBeInTheDocument();
    });
  });

  it('renders page variant with conversation sidebar and no icebreakers for started conversation', async () => {
    conversationsStore = [{
      id: 'conv-page-1',
      user_id: 'user-1',
      title: 'Quero um resumo do dia',
      messages: [
        { role: 'user', content: 'Quero um resumo do dia' },
        { role: 'assistant', content: 'Aqui está o resumo.' },
      ],
      last_context_route: '/pendencias',
      updated_at: '2026-03-15T10:00:00.000Z',
      created_at: '2026-03-15T10:00:00.000Z',
    }];

    render(
      <MemoryRouter initialEntries={["/claris?context=%2Fpendencias"]}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/conversas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nova conversa/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryAllByText('Quero um resumo do dia').length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/quebra-gelos da claris/i)).not.toBeInTheDocument();
  });

  it('shows icebreakers dropdown only when conversation has no messages yet', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/quebra-gelos da claris/i)).toBeInTheDocument();
    expect(screen.getByText(/priorize quem devo contatar hoje/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /alternar quebra-gelos da claris/i }));

    await waitFor(() => {
      expect(screen.queryByText(/liste os alunos em risco/i)).not.toBeInTheDocument();
    });
  });

  it('does not create multiple empty conversations in sequence', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^nova conversa$/i })).toBeInTheDocument();
    });

    const newConversationButton = screen.getByRole('button', { name: /^nova conversa$/i });
    await user.click(newConversationButton);
    await user.click(newConversationButton);
    await user.click(newConversationButton);

    await waitFor(() => {
      expect(screen.getByText(/ainda não há conversas iniciadas/i)).toBeInTheDocument();
      expect(screen.queryByText('Sem mensagens ainda')).not.toBeInTheDocument();
    });
  });

  it('renames a conversation manually from the sidebar', async () => {
    conversationsStore = [{
      id: 'conv-rename-1',
      user_id: 'user-1',
      title: 'Conversa antiga',
      messages: [
        { role: 'user', content: 'Mensagem inicial' },
      ],
      last_context_route: '/alunos',
      updated_at: '2026-03-15T10:00:00.000Z',
      created_at: '2026-03-15T10:00:00.000Z',
    }];

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Conversa antiga')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: /mais opções da conversa/i })[0]);
    await user.click(screen.getByRole('menuitem', { name: /renomear/i }));

    const renameInput = screen.getByRole('textbox', { name: /renomear conversa/i });
    expect(renameInput).toHaveFocus();
    await user.clear(renameInput);
    await user.type(renameInput, 'Plano de ação da semana');
    await user.click(screen.getByRole('button', { name: /salvar renomear conversa/i }));

    await waitFor(() => {
      expect(screen.getByText('Plano de ação da semana')).toBeInTheDocument();
    });
  });

  it('saves conversation rename with Enter key', async () => {
    conversationsStore = [{
      id: 'conv-rename-enter-1',
      user_id: 'user-1',
      title: 'Conversa para Enter',
      messages: [
        { role: 'user', content: 'Mensagem inicial' },
      ],
      last_context_route: '/alunos',
      updated_at: '2026-03-15T10:00:00.000Z',
      created_at: '2026-03-15T10:00:00.000Z',
    }];

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Conversa para Enter')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: /mais opções da conversa/i })[0]);
    await user.click(screen.getByRole('menuitem', { name: /renomear/i }));

    const renameInput = screen.getByRole('textbox', { name: /renomear conversa/i });
    await user.clear(renameInput);
    await user.type(renameInput, 'Conversa salva no Enter{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Conversa salva no Enter')).toBeInTheDocument();
    });
  });

  it('cancels conversation rename with Escape key', async () => {
    conversationsStore = [{
      id: 'conv-rename-esc-1',
      user_id: 'user-1',
      title: 'Conversa para Esc',
      messages: [
        { role: 'user', content: 'Mensagem inicial' },
      ],
      last_context_route: '/alunos',
      updated_at: '2026-03-15T10:00:00.000Z',
      created_at: '2026-03-15T10:00:00.000Z',
    }];

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Conversa para Esc')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: /mais opções da conversa/i })[0]);
    await user.click(screen.getByRole('menuitem', { name: /renomear/i }));

    const renameInput = screen.getByRole('textbox', { name: /renomear conversa/i });
    await user.clear(renameInput);
    await user.type(renameInput, 'Título temporário');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /renomear conversa/i })).not.toBeInTheDocument();
      expect(screen.queryByText('Título temporário')).not.toBeInTheDocument();
    });
  });

  it('keeps rename open and shows validation when title is empty', async () => {
    conversationsStore = [{
      id: 'conv-rename-empty-1',
      user_id: 'user-1',
      title: 'Conversa para validação',
      messages: [
        { role: 'user', content: 'Mensagem inicial' },
      ],
      last_context_route: '/alunos',
      updated_at: '2026-03-15T10:00:00.000Z',
      created_at: '2026-03-15T10:00:00.000Z',
    }];

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Conversa para validação')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: /mais opções da conversa/i })[0]);
    await user.click(screen.getByRole('menuitem', { name: /renomear/i }));

    const renameInput = screen.getByRole('textbox', { name: /renomear conversa/i });
    await user.clear(renameInput);
    await user.type(renameInput, '   ');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /renomear conversa/i })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/título não pode ficar vazio/i);
    });
  });

  it('deletes a conversation only after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    conversationsStore = [{
      id: 'conv-delete-1',
      user_id: 'user-1',
      title: 'Conversa para excluir',
      messages: [
        { role: 'user', content: 'Mensagem inicial' },
      ],
      last_context_route: '/mensagens',
      updated_at: '2026-03-15T10:00:00.000Z',
      created_at: '2026-03-15T10:00:00.000Z',
    }];

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/claris?context=%2Fmensagens"]}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Conversa para excluir')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: /mais opções da conversa/i })[0]);
    await user.click(screen.getByRole('menuitem', { name: /excluir/i }));

    await waitFor(() => {
      expect(screen.queryByText('Conversa para excluir')).not.toBeInTheDocument();
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});
