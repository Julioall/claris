import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ThemeProvider, useTheme } from "next-themes";
import { applyColorTheme } from "@/components/settings/ThemeCard";

// Pages
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import MyCourses from "@/pages/MyCourses";
import Schools from "@/pages/Schools";
import CoursePanel from "@/pages/CoursePanel";
import Students from "@/pages/Students";
import StudentProfile from "@/pages/StudentProfile";
import PendingTasks from "@/pages/PendingTasks";
import Messages from "@/pages/Messages";
import Settings from "@/pages/Settings";
import Reports from "@/pages/Reports";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Carregando...</div></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Carregando...</div></div>;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ColorThemeApplier({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const stored = localStorage.getItem('actim-color-theme') || 'slate';
    applyColorTheme(stored, resolvedTheme === 'dark');
  }, [resolvedTheme]);
  return <>{children}</>;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <ColorThemeApplier>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ColorThemeApplier>
  </ThemeProvider>
);

export default App;
