import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import AutomacoesPage from '@/features/automations/pages/AutomacoesPage';

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

  it('renders only automation title', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: /automacoes/i })).toBeInTheDocument();
    expect(screen.queryByText(/agende envios em massa/i)).not.toBeInTheDocument();
  });
});
