import { useEffect, type ReactNode } from 'react';
import { useTheme } from 'next-themes';

import { applyColorTheme, getStoredColorTheme } from '@/features/settings/lib/color-theme';
import { syncFaviconWithPrimaryColor } from '@/lib/favicon';

export function ColorThemeApplier({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const stored = getStoredColorTheme();
    applyColorTheme(stored, resolvedTheme === 'dark');
    syncFaviconWithPrimaryColor();
  }, [resolvedTheme]);

  return <>{children}</>;
}
