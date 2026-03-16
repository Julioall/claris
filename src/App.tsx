import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminRoute } from "@/components/admin/AdminRoute";
import { Spinner } from "@/components/ui/spinner";
import { ThemeProvider, useTheme } from "next-themes";
import { applyColorTheme } from "@/components/settings/ThemeCard";
import { syncFaviconWithPrimaryColor } from "@/lib/favicon";

// Pages
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import MyCourses from "@/pages/MyCourses";
import Schools from "@/pages/Schools";
import CoursePanel from "@/pages/CoursePanel";
import Students from "@/pages/Students";
import StudentProfile from "@/pages/StudentProfile";
import Tarefas from "@/pages/Tarefas";
import Agenda from "@/pages/Agenda";
import Messages from "@/pages/Messages";
import Settings from "@/pages/Settings";
import Reports from "@/pages/Reports";
import Claris from "@/pages/Claris";
import NotFound from "@/pages/NotFound";

// Admin Pages
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminConfiguracoes from "@/pages/admin/AdminConfiguracoes";
import AdminUsuarios from "@/pages/admin/AdminUsuarios";
import AdminMetricas from "@/pages/admin/AdminMetricas";
import AdminLogsErros from "@/pages/admin/AdminLogsErros";
import AdminSuporte from "@/pages/admin/AdminSuporte";
import AdminConversasClaris from "@/pages/admin/AdminConversasClaris";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/meus-cursos" element={<MyCourses />} />
        <Route path="/escolas" element={<Schools />} />
        <Route path="/cursos/:id" element={<CoursePanel />} />
        <Route path="/alunos" element={<Students />} />
        <Route path="/alunos/:id" element={<StudentProfile />} />
        <Route path="/tarefas" element={<Tarefas />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/mensagens" element={<Messages />} />
        <Route path="/claris" element={<Claris />} />
        <Route path="/relatorios" element={<Reports />} />
        <Route path="/configuracoes" element={<Settings />} />
      </Route>
      <Route element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/configuracoes" element={<AdminConfiguracoes />} />
        <Route path="/admin/usuarios" element={<AdminUsuarios />} />
        <Route path="/admin/metricas" element={<AdminMetricas />} />
        <Route path="/admin/logs-erros" element={<AdminLogsErros />} />
        <Route path="/admin/suporte" element={<AdminSuporte />} />
        <Route path="/admin/conversas-claris" element={<AdminConversasClaris />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function ColorThemeApplier({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const stored = localStorage.getItem('color-theme') || 'slate';
    applyColorTheme(stored, resolvedTheme === 'dark');
    syncFaviconWithPrimaryColor();
  }, [resolvedTheme]);
  return <>{children}</>;
}

const routerBasename = import.meta.env.BASE_URL === "/"
  ? "/"
  : import.meta.env.BASE_URL.replace(/\/$/, "");

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <ColorThemeApplier>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter basename={routerBasename} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ColorThemeApplier>
  </ThemeProvider>
);

export default App;
