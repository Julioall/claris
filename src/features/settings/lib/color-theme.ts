export interface ColorTheme {
  id: string;
  label: string;
  preview: { primary: string; accent: string; bg: string };
  vars: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}

export const COLOR_THEME_STORAGE_KEY = 'color-theme';

export const COLOR_THEMES: ColorTheme[] = [
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

export function getStoredColorTheme(): string {
  try {
    return localStorage.getItem(COLOR_THEME_STORAGE_KEY) || 'slate';
  } catch {
    return 'slate';
  }
}

export function applyColorTheme(themeId: string, isDark: boolean) {
  const theme = COLOR_THEMES.find((item) => item.id === themeId);
  if (!theme) return;

  const vars = isDark ? theme.vars.dark : theme.vars.light;
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}
