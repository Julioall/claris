import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders "A fazer" for todo status', () => {
    render(<StatusBadge status="todo" />);
    expect(screen.getByText('A fazer')).toBeInTheDocument();
  });

  it('renders "Em andamento" for in_progress status', () => {
    render(<StatusBadge status="in_progress" />);
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
  });

  it('renders "Concluído" for done status', () => {
    render(<StatusBadge status="done" />);
    expect(screen.getByText('Concluído')).toBeInTheDocument();
  });

  it('applies small size classes', () => {
    const { container } = render(<StatusBadge status="todo" size="sm" />);
    expect(container.firstChild).toHaveClass('text-xs', 'px-1.5', 'py-0.5');
  });

  it('applies custom className', () => {
    const { container } = render(<StatusBadge status="todo" className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
