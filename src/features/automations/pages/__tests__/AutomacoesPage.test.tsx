import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import AutomacoesPage from '@/features/automations/pages/AutomacoesPage';

vi.mock('@/features/automations/components/RotinasTab', () => ({
  RotinasTab: () => <div data-testid="rotinas-tab">Rotinas automaticas</div>,
}));

function renderPage(initialEntries?: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AutomacoesPage />
    </MemoryRouter>,
  );
}

describe('Automacoes page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the automation hub with trigger-centric tabs', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: /automacoes/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /gatilhos/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /regras/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /governanca/i })).toBeInTheDocument();
    expect(screen.getByText(/atividade atrasada/i)).toBeInTheDocument();
  });

  it('redirects legacy campaign tabs to the campaigns module', () => {
    render(
      <MemoryRouter initialEntries={['/automacoes?tab=modelos']}>
        <Routes>
          <Route path="/automacoes" element={<AutomacoesPage />} />
          <Route path="/campanhas" element={<div data-testid="campaigns-route">Campanhas</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('campaigns-route')).toBeInTheDocument();
  });

  it('switches between automation tabs', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('tab', { name: /regras/i }));
    expect(screen.getByText(/estrutura minima de uma automacao/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /governanca/i }));
    expect(screen.getByTestId('rotinas-tab')).toBeInTheDocument();
  });
});
