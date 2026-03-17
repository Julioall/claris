import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FloatingClarisChat } from '@/components/layout/FloatingClarisChat';
import { CLARIS_CONFIGURED_STORAGE_KEY } from '@/lib/claris-settings';

const ROUTER_FUTURE = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
}));

const invokeMock = vi.fn();
const fromMock = vi.fn();
const usePermissionsMock = vi.fn();
const WIDGET_OPEN_STORAGE_KEY = 'claris_chat_widget_open';
let clarisAvailabilityState: 'ready' | 'not_configured' | 'invalid' = 'not_configured';
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

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => usePermissionsMock(),
}));

function setClarisAvailability(value: 'ready' | 'not_configured' | 'invalid') {
  clarisAvailabilityState = value;
  localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, value === 'ready' ? 'true' : 'false');
}

const HISTORY_STORAGE_KEY = 'claris_chat_history:user-1';

beforeEach(() => {
  invokeMock.mockReset();
  fromMock.mockReset();
  localStorage.clear();
  clarisAvailabilityState = 'not_configured';
  usePermissionsMock.mockReturnValue({
    isAdmin: false,
    role: null,
    permissions: [],
    canAccessAdminSection: () => false,
  });
  conversationsStore = [];

  fromMock.mockImplementation((table: string) => {
    if (table === 'app_settings') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                singleton_id: 'global',
                moodle_connection_url: 'https://moodle.example.com',
                moodle_connection_service: 'moodle_mobile_app',
                risk_threshold_days: { atencao: 7, risco: 14, critico: 30 },
                claris_llm_settings: clarisAvailabilityState === 'ready'
                  ? {
                      provider: 'openai',
                      model: 'gpt-4o-mini',
                      baseUrl: 'https://api.openai.com/v1',
                      apiKey: 'sk-test',
                      configured: true,
                    }
                  : clarisAvailabilityState === 'invalid'
                    ? {
                        provider: 'openai',
                        model: '',
                        baseUrl: 'https://api.openai.com/v1',
                        apiKey: '',
                        configured: true,
                      }
                    : {},
              },
              error: null,
            }),
          }),
        }),
      };
    }

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
    <MemoryRouter future={ROUTER_FUTURE}>
      <FloatingClarisChat />
    </MemoryRouter>,
  );
}

describe('FloatingClarisChat', () => {
  it('opens and closes the floating chat', async () => {
    invokeMock.mockResolvedValue({ data: { reply: 'ok' }, error: null });
    setClarisAvailability('not_configured');
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

  it('uses the remaining panel height for the floating message area', async () => {
    localStorage.setItem(WIDGET_OPEN_STORAGE_KEY, 'true');
    renderFloatingClarisChat();

    const scrollArea = screen.getByTestId('floating-chat-scroll-area');

    expect(scrollArea).toHaveClass('flex-1');
    expect(scrollArea).toHaveClass('min-h-0');
    expect(scrollArea).not.toHaveClass('h-[320px]');
  });

  it('replies asking for configuration when not configured', async () => {
    invokeMock.mockResolvedValue({ data: { reply: 'ok' }, error: null });
    setClarisAvailability('not_configured');
    renderFloatingClarisChat();

    await userEvent.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));

    await waitFor(() => {
      expect(screen.getByText(/aguardando o administrador do site me configurar/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/mensagem para claris ia/i)).toBeDisabled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('shows invalid configuration message for admin', async () => {
    setClarisAvailability('invalid');
    usePermissionsMock.mockReturnValue({
      isAdmin: true,
      role: 'admin',
      permissions: ['admin'],
      canAccessAdminSection: () => true,
    });

    renderFloatingClarisChat();

    await userEvent.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));

    await waitFor(() => {
      expect(screen.getByText(/configuração atual da claris ia está inválida/i)).toBeInTheDocument();
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('calls edge function and renders llm response when configured', async () => {
    invokeMock.mockResolvedValue({ data: { reply: 'Olá! Posso te ajudar com seus alunos hoje.' }, error: null });
    setClarisAvailability('ready');
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
    setClarisAvailability('ready');
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
    setClarisAvailability('ready');
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
    setClarisAvailability('ready');
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

    setClarisAvailability('ready');
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

    setClarisAvailability('ready');
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

    setClarisAvailability('ready');
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
      last_context_route: '/tarefas',
      updated_at: '2026-03-15T10:00:00.000Z',
      created_at: '2026-03-15T10:00:00.000Z',
    }];

    render(
      <MemoryRouter initialEntries={["/claris?context=%2Ftarefas"]} future={ROUTER_FUTURE}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/seus chats/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nova conversa/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryAllByText('Quero um resumo do dia').length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/alunos em risco com último acesso/i)).not.toBeInTheDocument();
  });

  it('shows icebreakers only when conversation has no messages yet', async () => {
    setClarisAvailability('ready');
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]} future={ROUTER_FUTURE}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    const suggestionButton = await screen.findByRole('button', { name: /^alunos em risco com último acesso$/i });
    expect(suggestionButton).toBeInTheDocument();

    await user.click(suggestionButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^alunos em risco com último acesso$/i })).not.toBeInTheDocument();
    });
  });

  it('does not create multiple empty conversations in sequence', async () => {
    setClarisAvailability('ready');
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]} future={ROUTER_FUTURE}>
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
      expect(screen.queryByText('Sem mensagens ainda')).not.toBeInTheDocument();
      expect(screen.queryAllByRole('button', { name: /mais opções da conversa/i })).toHaveLength(0);
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
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]} future={ROUTER_FUTURE}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /mais opções da conversa/i }).length).toBeGreaterThan(0);
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
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]} future={ROUTER_FUTURE}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /mais opções da conversa/i }).length).toBeGreaterThan(0);
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
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]} future={ROUTER_FUTURE}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /mais opções da conversa/i }).length).toBeGreaterThan(0);
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
      <MemoryRouter initialEntries={["/claris?context=%2Falunos"]} future={ROUTER_FUTURE}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /mais opções da conversa/i }).length).toBeGreaterThan(0);
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
      <MemoryRouter initialEntries={["/claris?context=%2Fmensagens"]} future={ROUTER_FUTURE}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /mais opções da conversa/i }).length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole('button', { name: /mais opções da conversa/i })[0]);
    await user.click(screen.getByRole('menuitem', { name: /excluir/i }));

    await waitFor(() => {
      expect(screen.queryByText('Conversa para excluir')).not.toBeInTheDocument();
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('shows unavailability as a banner, not a chat message bubble', async () => {
    setClarisAvailability('not_configured');
    renderFloatingClarisChat();

    await userEvent.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));

    await waitFor(() => {
      expect(screen.getByText(/aguardando o administrador do site me configurar/i)).toBeInTheDocument();
    });

    // The unavailability text must NOT be inside the message list (not a chat bubble)
    const messageList = screen.getByTestId('message-list');
    expect(messageList).not.toHaveTextContent(/aguardando o administrador do site me configurar/i);
  });

  it('does not duplicate unavailability notice when the page variant remounts', async () => {
    setClarisAvailability('not_configured');

    const { unmount } = render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/aguardando o administrador do site me configurar/i)).toHaveLength(1);
    });

    unmount();

    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/aguardando o administrador do site me configurar/i)).toHaveLength(1);
    });
  });

  it('does not persist unavailability notice to localStorage', async () => {
    setClarisAvailability('not_configured');

    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <FloatingClarisChat variant="page" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/aguardando o administrador do site me configurar/i)).toBeInTheDocument();
    });

    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    const history = stored ? (JSON.parse(stored) as Array<{ role: string; content: string }>) : [];
    expect(history).toHaveLength(0);
  });
});
