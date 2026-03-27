import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';

import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { BackgroundActivityProvider } from '@/contexts/BackgroundActivityContext';

import { ColorThemeApplier } from './ColorThemeApplier';
import { BackgroundActivitySyncBridge } from './BackgroundActivitySyncBridge';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ColorThemeApplier>
        <QueryClientProvider client={queryClient}>
          <BackgroundActivityProvider>
            <AuthProvider>
              <TooltipProvider>
                <BackgroundActivitySyncBridge />
                <Toaster />
                <Sonner />
                {children}
              </TooltipProvider>
            </AuthProvider>
          </BackgroundActivityProvider>
        </QueryClientProvider>
      </ColorThemeApplier>
    </ThemeProvider>
  );
}
