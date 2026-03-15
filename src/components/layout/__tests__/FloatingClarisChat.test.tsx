import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FloatingClarisChat } from '@/components/layout/FloatingClarisChat';

describe('FloatingClarisChat', () => {
  it('opens and closes the floating chat', async () => {
    const user = userEvent.setup();
    render(<FloatingClarisChat />);

    const openButton = screen.getByRole('button', { name: /abrir chat da claris ia/i });
    await user.click(openButton);

    expect(screen.getByLabelText(/mensagem para claris ia/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^fechar chat$/i }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/digite sua mensagem/i)).not.toBeInTheDocument();
    });
  });

  it('replies with placeholder message when user sends a message', async () => {
    const user = userEvent.setup();
    render(<FloatingClarisChat />);

    await user.click(screen.getByRole('button', { name: /abrir chat da claris ia/i }));
    await user.type(screen.getByLabelText(/mensagem para claris ia/i), 'Oi, Claris');
    await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    expect(screen.getByText('Oi, Claris')).toBeInTheDocument();
    expect(
      screen.getByText(/ainda estou em desenvolvimento, mas em breve estarei aqui para te ajudar/i)
    ).toBeInTheDocument();
  });
});
