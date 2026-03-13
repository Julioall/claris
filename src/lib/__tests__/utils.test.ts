import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn (className utility)', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false, 'visible')).toBe('base visible');
  });

  it('merges tailwind conflicts correctly', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null)).toBe('base');
  });

  it('handles empty input', () => {
    expect(cn()).toBe('');
  });
});
