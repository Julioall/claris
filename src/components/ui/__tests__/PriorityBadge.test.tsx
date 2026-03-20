import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriorityBadge } from '../PriorityBadge';

describe('PriorityBadge', () => {
  it('renders "Baixa" for low priority', () => {
    render(<PriorityBadge priority="low" />);
    expect(screen.getByText('Baixa')).toBeInTheDocument();
  });

  it('renders "Média" for medium priority', () => {
    render(<PriorityBadge priority="medium" />);
    expect(screen.getByText('Média')).toBeInTheDocument();
  });

  it('renders "Alta" for high priority', () => {
    render(<PriorityBadge priority="high" />);
    expect(screen.getByText('Alta')).toBeInTheDocument();
  });

  it('renders "Urgente" for urgent priority', () => {
    render(<PriorityBadge priority="urgent" />);
    expect(screen.getByText('Urgente')).toBeInTheDocument();
  });

  it('applies small size classes', () => {
    const { container } = render(<PriorityBadge priority="high" size="sm" />);
    expect(container.firstChild).toHaveClass('text-xs', 'px-1.5', 'py-0.5');
  });

  it('applies custom className', () => {
    const { container } = render(<PriorityBadge priority="urgent" className="ml-2" />);
    expect(container.firstChild).toHaveClass('ml-2');
  });
});
