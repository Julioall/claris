import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { syncFaviconWithPrimaryColor } from '@/lib/favicon';
import { useEffect, useState } from 'react';
import {
  applyColorTheme,
  COLOR_THEME_STORAGE_KEY,
  COLOR_THEMES,
  getStoredColorTheme,
} from '../lib/color-theme';

const MODES = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const;

function resolvePreviewPrimary(
  themeId: string,
  resolvedTheme: string | undefined,
  previewPrimary: string,
  vars: { light: Record<string, string>; dark: Record<string, string> },
): string {
  if (themeId !== 'slate') return previewPrimary;

  const isDark = resolvedTheme === 'dark';
  const primaryValue = isDark ? vars.dark['--primary'] : vars.light['--primary'];
  return primaryValue ? `hsl(${primaryValue})` : previewPrimary;
}

export function ThemeCard() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [colorTheme, setColorTheme] = useState(getStoredColorTheme);

  // Apply color theme whenever resolved theme or color theme changes
  useEffect(() => {
    if (resolvedTheme) {
      applyColorTheme(colorTheme, resolvedTheme === 'dark');
      syncFaviconWithPrimaryColor();
    }
  }, [resolvedTheme, colorTheme]);

  const handleColorTheme = (id: string) => {
    setColorTheme(id);
    try {
      localStorage.setItem(COLOR_THEME_STORAGE_KEY, id);
    } catch { /* noop */ }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sun className="h-5 w-5" />
          Aparencia
        </CardTitle>
        <CardDescription>Escolha o modo e a cor principal da interface</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Light / Dark / System */}
        <div>
          <p className="text-sm font-medium mb-3">Modo</p>
          <div className="grid grid-cols-3 gap-3">
            {MODES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors hover:bg-accent',
                  theme === value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Color themes */}
        <div>
          <p className="text-sm font-medium mb-3">Cor</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {COLOR_THEMES.map((ct) => (
              <button
                key={ct.id}
                onClick={() => handleColorTheme(ct.id)}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent',
                  colorTheme === ct.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border'
                )}
              >
                {(() => {
                  const previewPrimary = resolvePreviewPrimary(
                    ct.id,
                    resolvedTheme,
                    ct.preview.primary,
                    ct.vars,
                  );

                  return (
                    <span
                      className="h-6 w-6 rounded-full shrink-0 border"
                      style={{ background: previewPrimary, borderColor: previewPrimary }}
                    />
                  );
                })()}
                <span className="text-sm font-medium">{ct.label}</span>
                {colorTheme === ct.id && (
                  <Check className="h-4 w-4 text-primary absolute top-2 right-2" />
                )}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
