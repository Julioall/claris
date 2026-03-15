import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { syncFaviconWithPrimaryColor } from '@/lib/favicon';
import { useEffect, useState } from 'react';

const MODES = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const;

export interface ColorTheme {
  id: string;
  label: string;
  preview: { primary: string; accent: string; bg: string };
  vars: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}

const COLOR_THEMES: ColorTheme[] = [
  {
    id: 'slate',
    label: 'Padrao',
    preview: { primary: 'hsl(222 47% 11%)', accent: 'hsl(210 40% 96%)', bg: 'hsl(0 0% 100%)' },
    vars: {
      light: {
        '--primary': '222.2 47.4% 11.2%',
        '--primary-foreground': '210 40% 98%',
        '--ring': '222.2 84% 4.9%',
        '--sidebar-primary': '240 5.9% 10%',
        '--sidebar-ring': '217.2 91.2% 59.8%',
      },
      dark: {
        '--primary': '210 40% 98%',
        '--primary-foreground': '222.2 47.4% 11.2%',
        '--ring': '212.7 26.8% 83.9%',
        '--sidebar-primary': '224.3 76.3% 48%',
        '--sidebar-ring': '217.2 91.2% 59.8%',
      },
    },
  },
  {
    id: 'blue',
    label: 'Azul',
    preview: { primary: 'hsl(221 83% 53%)', accent: 'hsl(214 95% 93%)', bg: 'hsl(0 0% 100%)' },
    vars: {
      light: {
        '--primary': '221.2 83.2% 53.3%',
        '--primary-foreground': '210 40% 98%',
        '--ring': '221.2 83.2% 53.3%',
        '--sidebar-primary': '221.2 83.2% 53.3%',
        '--sidebar-ring': '221.2 83.2% 53.3%',
      },
      dark: {
        '--primary': '217.2 91.2% 59.8%',
        '--primary-foreground': '222.2 47.4% 11.2%',
        '--ring': '217.2 91.2% 59.8%',
        '--sidebar-primary': '217.2 91.2% 59.8%',
        '--sidebar-ring': '217.2 91.2% 59.8%',
      },
    },
  },
  {
    id: 'green',
    label: 'Verde',
    preview: { primary: 'hsl(142 71% 45%)', accent: 'hsl(138 60% 93%)', bg: 'hsl(0 0% 100%)' },
    vars: {
      light: {
        '--primary': '142 71% 45%',
        '--primary-foreground': '0 0% 100%',
        '--ring': '142 71% 45%',
        '--sidebar-primary': '142 71% 45%',
        '--sidebar-ring': '142 71% 45%',
      },
      dark: {
        '--primary': '142 60% 55%',
        '--primary-foreground': '0 0% 5%',
        '--ring': '142 60% 55%',
        '--sidebar-primary': '142 60% 55%',
        '--sidebar-ring': '142 60% 55%',
      },
    },
  },
  {
    id: 'violet',
    label: 'Violeta',
    preview: { primary: 'hsl(263 70% 50%)', accent: 'hsl(260 60% 94%)', bg: 'hsl(0 0% 100%)' },
    vars: {
      light: {
        '--primary': '263 70% 50.4%',
        '--primary-foreground': '0 0% 100%',
        '--ring': '263 70% 50.4%',
        '--sidebar-primary': '263 70% 50.4%',
        '--sidebar-ring': '263 70% 50.4%',
      },
      dark: {
        '--primary': '263 60% 65%',
        '--primary-foreground': '0 0% 5%',
        '--ring': '263 60% 65%',
        '--sidebar-primary': '263 60% 65%',
        '--sidebar-ring': '263 60% 65%',
      },
    },
  },
  {
    id: 'orange',
    label: 'Laranja',
    preview: { primary: 'hsl(25 95% 53%)', accent: 'hsl(25 90% 94%)', bg: 'hsl(0 0% 100%)' },
    vars: {
      light: {
        '--primary': '24.6 95% 53.1%',
        '--primary-foreground': '0 0% 100%',
        '--ring': '24.6 95% 53.1%',
        '--sidebar-primary': '24.6 95% 53.1%',
        '--sidebar-ring': '24.6 95% 53.1%',
      },
      dark: {
        '--primary': '20.5 90.2% 58.2%',
        '--primary-foreground': '0 0% 5%',
        '--ring': '20.5 90.2% 58.2%',
        '--sidebar-primary': '20.5 90.2% 58.2%',
        '--sidebar-ring': '20.5 90.2% 58.2%',
      },
    },
  },
  {
    id: 'rose',
    label: 'Rosa',
    preview: { primary: 'hsl(346 77% 50%)', accent: 'hsl(346 70% 94%)', bg: 'hsl(0 0% 100%)' },
    vars: {
      light: {
        '--primary': '346.8 77.2% 49.8%',
        '--primary-foreground': '0 0% 100%',
        '--ring': '346.8 77.2% 49.8%',
        '--sidebar-primary': '346.8 77.2% 49.8%',
        '--sidebar-ring': '346.8 77.2% 49.8%',
      },
      dark: {
        '--primary': '346.8 70% 60%',
        '--primary-foreground': '0 0% 5%',
        '--ring': '346.8 70% 60%',
        '--sidebar-primary': '346.8 70% 60%',
        '--sidebar-ring': '346.8 70% 60%',
      },
    },
  },
  {
    id: 'teal',
    label: 'Teal',
    preview: { primary: 'hsl(173 80% 36%)', accent: 'hsl(170 60% 93%)', bg: 'hsl(0 0% 100%)' },
    vars: {
      light: {
        '--primary': '173 80% 36%',
        '--primary-foreground': '0 0% 100%',
        '--ring': '173 80% 36%',
        '--sidebar-primary': '173 80% 36%',
        '--sidebar-ring': '173 80% 36%',
      },
      dark: {
        '--primary': '173 60% 50%',
        '--primary-foreground': '0 0% 5%',
        '--ring': '173 60% 50%',
        '--sidebar-primary': '173 60% 50%',
        '--sidebar-ring': '173 60% 50%',
      },
    },
  },
];

const STORAGE_KEY = 'color-theme';

function getStoredColorTheme(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'slate';
  } catch {
    return 'slate';
  }
}

export function applyColorTheme(themeId: string, isDark: boolean) {
  const theme = COLOR_THEMES.find(t => t.id === themeId);
  if (!theme) return;
  const vars = isDark ? theme.vars.dark : theme.vars.light;
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
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
      localStorage.setItem(STORAGE_KEY, id);
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
                <span
                  className="h-6 w-6 rounded-full shrink-0 border"
                  style={{ background: ct.preview.primary, borderColor: ct.preview.primary }}
                />
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
