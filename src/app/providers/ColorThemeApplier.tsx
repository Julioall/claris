import { useEffect, type ReactNode } from 'react';
import { useTheme } from 'next-themes';

import { applyColorTheme } from '@/components/settings/ThemeCard';
import { syncFaviconWithPrimaryColor } from '@/lib/favicon';

export function ColorThemeApplier({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const stored = localStorage.getItem('color-theme') || 'slate';
    applyColorTheme(stored, resolvedTheme === 'dark');
    syncFaviconWithPrimaryColor();
  }, [resolvedTheme]);

  return <>{children}</>;
}
